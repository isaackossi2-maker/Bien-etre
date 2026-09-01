import { createContext, MutableRefObject, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";
import { useStateRef } from "../hooks/useStateRef";

export type CallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "active";
export type GroupCallStatus = "idle" | "incoming" | "active";

export interface MeetingAlert {
  id: string;
  title: string;
  createdBy: { id: string; name: string };
}

export interface CallPeer {
  id: string;
  name: string;
}

export interface GroupCallInfo {
  groupId: string;
  groupName: string;
  video: boolean;
  fromName?: string;
}

export interface GroupParticipant {
  id: string;
  name: string;
  stream: MediaStream | null;
}

interface CallContextValue {
  status: CallStatus;
  peer: CallPeer | null;
  isVideo: boolean;
  error: string | null;
  errorKey: number;
  duration: number;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  startCall: (peer: CallPeer, video: boolean) => void;
  acceptCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;

  groupCallStatus: GroupCallStatus;
  groupCallInfo: GroupCallInfo | null;
  groupIsVideo: boolean;
  groupParticipants: GroupParticipant[];
  groupLocalStream: MediaStream | null;
  groupMuted: boolean;
  groupCameraOff: boolean;
  startGroupCall: (groupId: string, groupName: string, video: boolean) => void;
  joinGroupCall: () => void;
  declineGroupCall: () => void;
  leaveGroupCall: () => void;
  toggleGroupMute: () => void;
  toggleGroupCamera: () => void;

  meetingAlert: MeetingAlert | null;
  meetingListVersion: number;
  dismissMeetingAlert: () => void;

  // Connexion WebSocket partagée, réutilisable par d'autres écrans (la salle de réunion) au
  // lieu d'en ouvrir une deuxième par onglet.
  wsConnected: boolean;
  sendSignal: (data: unknown) => void;
  onSignal: (listener: (msg: SignalMessage) => void) => () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

// Le serveur TURN auto-hébergé (coturn, voir docker-compose.yml) doit être joint via
// l'IP publique de la machine qui l'héberge : le nom de domaine du tunnel Cloudflare
// (window.location.hostname) ne relaie que le trafic web, pas le trafic TURN UDP/TCP.
const TURN_HOST = import.meta.env.VITE_TURN_HOST || (typeof window !== "undefined" ? window.location.hostname : "localhost");
// Injecté au build (voir VITE_TURN_PASSWORD dans docker-compose.yml) à partir de .env, jamais
// écrit en dur dans le code source suivi par git.
const TURN_PASSWORD = import.meta.env.VITE_TURN_PASSWORD || "";
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: [`turn:${TURN_HOST}:3478?transport=udp`, `turn:${TURN_HOST}:3478?transport=tcp`],
    username: "appperso",
    credential: TURN_PASSWORD,
  },
];
const OUTGOING_TIMEOUT_MS = 30000;

interface SignalMessage {
  type: string;
  from?: string;
  fromName?: string;
  to?: string;
  video?: boolean;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
  groupId?: string;
  groupName?: string;
  id?: string;
  name?: string;
  participants?: { id: string; name: string }[];
  meeting?: MeetingAlert;
  meetingId?: string;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [status, setStatusBoth, statusRef] = useStateRef<CallStatus>("idle");
  const [peer, setPeerBoth, peerRef] = useStateRef<CallPeer | null>(null);
  const [isVideo, setIsVideoBoth, isVideoRef] = useStateRef(false);
  const [error, setErrorState] = useState<string | null>(null);
  // errorKey s'incrémente à chaque erreur signalée, même si le message est identique au
  // précédent : React ignore un setState de valeur strictement égale (Object.is), donc deux
  // échecs d'appel consécutifs au même message ("Pas de réponse.") ne déclenchaient jamais de
  // second rendu — le toast d'erreur ne réapparaissait pas pour le second échec.
  const [errorKey, setErrorKey] = useState(0);
  function setError(message: string | null) {
    setErrorState(message);
    if (message) setErrorKey((k) => k + 1);
  }
  const [duration, setDuration] = useState(0);
  const [localStream, setLocalStreamBoth, localStreamRef] = useStateRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const [groupCallStatus, setGroupCallStatusBoth, groupCallStatusRef] = useStateRef<GroupCallStatus>("idle");
  const [groupCallInfo, setGroupCallInfoBoth, groupCallInfoRef] = useStateRef<GroupCallInfo | null>(null);
  const [groupIsVideo, setGroupIsVideo] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipant[]>([]);
  const [groupLocalStream, setGroupLocalStreamBoth, groupLocalStreamRef] = useStateRef<MediaStream | null>(null);
  const [groupMuted, setGroupMuted] = useState(false);
  const [groupCameraOff, setGroupCameraOff] = useState(false);

  const [meetingAlert, setMeetingAlert] = useState<MeetingAlert | null>(null);
  // Incrémenté à chaque création OU fin de réunion : signal fiable pour que la page Réunion
  // rafraîchisse sa liste dans les deux cas (auparavant elle ne rechargeait que sur
  // "meetingAlert" devenant vrai, donc jamais à la fermeture d'une réunion : la carte restée
  // affichée gardait son bouton "Rejoindre" alors que la réunion était déjà terminée).
  const [meetingListVersion, setMeetingListVersion] = useState(0);
  // Vrai une fois la connexion WebSocket partagée établie : la salle de réunion attend ce signal
  // avant d'envoyer "meeting:join" (au premier montage comme après une reconnexion).
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localMediaPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const outgoingTimeoutRef = useRef<number | null>(null);
  const durationTimerRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const groupLocalMediaPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const groupPeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const groupPendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const groupParticipantNamesRef = useRef<Map<string, string>>(new Map());
  const groupStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  function clearOutgoingTimeout() {
    if (outgoingTimeoutRef.current) {
      window.clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
  }

  function stopDurationTimer() {
    if (durationTimerRef.current) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }

  function startDurationTimer() {
    stopDurationTimer();
    durationTimerRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
  }

  // getLocalMedia et getGroupLocalMedia sont sinon identiques à part le ref de cache et le
  // setState appelé une fois le flux obtenu ; factorisé pour ne garder qu'une seule copie de
  // la logique d'acquisition/cache/erreur de getUserMedia.
  function acquireMedia(
    promiseRef: MutableRefObject<Promise<MediaStream> | null>,
    video: boolean,
    onStream: (stream: MediaStream) => void
  ): Promise<MediaStream> {
    if (promiseRef.current) return promiseRef.current;
    const p = navigator.mediaDevices
      .getUserMedia({ audio: true, video })
      .then((stream) => {
        onStream(stream);
        return stream;
      })
      .catch((err) => {
        promiseRef.current = null;
        throw err;
      });
    promiseRef.current = p;
    return p;
  }

  function getLocalMedia(video: boolean): Promise<MediaStream> {
    return acquireMedia(localMediaPromiseRef, video, setLocalStreamBoth);
  }

  function cleanupResources() {
    clearOutgoingTimeout();
    stopDurationTimer();
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    setLocalStreamBoth(null);
    setRemoteStream(null);
    setPeerBoth(null);
    setDuration(0);
    setMuted(false);
    setCameraOff(false);
    pendingCandidatesRef.current = [];
    localMediaPromiseRef.current = null;
  }

  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate && peerRef.current) {
        send({ type: "webrtc:ice", to: peerRef.current.id, candidate: e.candidate });
      }
    };
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
      if (statusRef.current !== "active") {
        setStatusBoth("active");
        startDurationTimer();
      }
    };
    pcRef.current = pc;
    return pc;
  }

  function flushPendingCandidates() {
    const pc = pcRef.current;
    if (!pc) return;
    pendingCandidatesRef.current.forEach((c) => {
      pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    });
    pendingCandidatesRef.current = [];
  }

  async function initiateOffer() {
    try {
      const pc = createPeerConnection();
      const stream = await getLocalMedia(isVideoRef.current);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "webrtc:offer", to: peerRef.current!.id, sdp: offer });
    } catch {
      setError(t("callOverlay.micError"));
      endCall(true);
    }
  }

  async function handleRemoteOffer(sdp: RTCSessionDescriptionInit) {
    const pc = pcRef.current ?? createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    flushPendingCandidates();
    try {
      const stream = await getLocalMedia(isVideoRef.current);
      stream.getTracks().forEach((t) => {
        if (!pc.getSenders().some((s) => s.track === t)) pc.addTrack(t, stream);
      });
    } catch {
      setError(t("callOverlay.micError"));
      endCall(true);
      return;
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (peerRef.current) send({ type: "webrtc:answer", to: peerRef.current.id, sdp: answer });
  }

  // Laisse une trace de l'appel manqué/refusé dans le fil de discussion, pour que
  // la personne le voie même si elle n'était pas sur l'application au moment de l'appel.
  function logMissedCall(recipientId: string, video: boolean, reason: "no-answer" | "rejected") {
    const label = video ? t("callOverlay.missedVideoLabel") : t("callOverlay.missedVoiceLabel");
    const content =
      reason === "rejected" ? t("callOverlay.missedRejected", { label }) : t("callOverlay.missedNoAnswer", { label });
    api.post(`/messages/thread/${recipientId}`, { content: `📞 ${content}` }).catch(() => {});
  }

  // Termine l'appel en cours et prévient l'autre partie avec le bon type de signal
  // selon l'état actuel (annulation, refus ou raccroché).
  function endCall(notify: boolean) {
    if (notify && peerRef.current) {
      const type =
        statusRef.current === "outgoing" ? "call:cancel" : statusRef.current === "incoming" ? "call:reject" : "call:hangup";
      send({ type, to: peerRef.current.id });
    }
    cleanupResources();
    setStatusBoth("idle");
  }

  // ---------- Appels de groupe (maillage : une RTCPeerConnection par participant) ----------

  function syncGroupParticipants() {
    const list: GroupParticipant[] = [];
    groupParticipantNamesRef.current.forEach((name, id) => {
      list.push({ id, name, stream: groupStreamsRef.current.get(id) ?? null });
    });
    setGroupParticipants(list);
  }

  function getGroupLocalMedia(video: boolean): Promise<MediaStream> {
    return acquireMedia(groupLocalMediaPromiseRef, video, setGroupLocalStreamBoth);
  }

  function createGroupPeerConnection(peerId: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "webrtc:ice", to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      groupStreamsRef.current.set(peerId, e.streams[0]);
      syncGroupParticipants();
    };
    groupPeerConnectionsRef.current.set(peerId, pc);
    return pc;
  }

  function flushGroupPendingCandidates(peerId: string) {
    const pc = groupPeerConnectionsRef.current.get(peerId);
    if (!pc) return;
    const pending = groupPendingCandidatesRef.current.get(peerId) ?? [];
    pending.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
    groupPendingCandidatesRef.current.delete(peerId);
  }

  function closeGroupPeer(peerId: string) {
    groupPeerConnectionsRef.current.get(peerId)?.close();
    groupPeerConnectionsRef.current.delete(peerId);
    groupStreamsRef.current.delete(peerId);
    groupParticipantNamesRef.current.delete(peerId);
    groupPendingCandidatesRef.current.delete(peerId);
    syncGroupParticipants();
  }

  function cleanupGroupCall() {
    groupPeerConnectionsRef.current.forEach((pc) => pc.close());
    groupPeerConnectionsRef.current.clear();
    groupStreamsRef.current.clear();
    groupParticipantNamesRef.current.clear();
    groupPendingCandidatesRef.current.clear();
    groupLocalStreamRef.current?.getTracks().forEach((t) => t.stop());
    setGroupLocalStreamBoth(null);
    setGroupParticipants([]);
    setGroupCallInfoBoth(null);
    setGroupMuted(false);
    setGroupCameraOff(false);
    groupLocalMediaPromiseRef.current = null;
  }

  async function initiateGroupOfferTo(peerId: string, peerName: string) {
    groupParticipantNamesRef.current.set(peerId, peerName);
    const pc = createGroupPeerConnection(peerId);
    const stream = groupLocalStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "webrtc:offer", to: peerId, sdp: offer });
    syncGroupParticipants();
  }

  async function handleGroupRemoteOffer(fromId: string, fromName: string, sdp: RTCSessionDescriptionInit) {
    groupParticipantNamesRef.current.set(fromId, fromName);
    const pc = groupPeerConnectionsRef.current.get(fromId) ?? createGroupPeerConnection(fromId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    flushGroupPendingCandidates(fromId);
    const stream = groupLocalStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => {
        if (!pc.getSenders().some((s) => s.track === t)) pc.addTrack(t, stream);
      });
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send({ type: "webrtc:answer", to: fromId, sdp: answer });
    syncGroupParticipants();
  }

  async function startGroupCall(groupId: string, groupName: string, video: boolean) {
    if (statusRef.current !== "idle" || groupCallStatusRef.current !== "idle") return;
    setError(null);
    setGroupIsVideo(video);
    setGroupCallInfoBoth({ groupId, groupName, video });
    setGroupCallStatusBoth("active");
    try {
      await getGroupLocalMedia(video);
    } catch {
      setError(t("callOverlay.micError"));
      cleanupGroupCall();
      setGroupCallStatusBoth("idle");
      return;
    }
    send({ type: "group-call:invite", groupId, groupName, video });
  }

  async function joinGroupCall() {
    if (groupCallStatusRef.current !== "incoming" || !groupCallInfoRef.current) return;
    const { groupId, video } = groupCallInfoRef.current;
    setGroupCallStatusBoth("active");
    try {
      await getGroupLocalMedia(video);
    } catch {
      setError(t("callOverlay.micError"));
      cleanupGroupCall();
      setGroupCallStatusBoth("idle");
      return;
    }
    send({ type: "group-call:join", groupId });
  }

  function declineGroupCall() {
    if (groupCallStatusRef.current !== "incoming") return;
    cleanupGroupCall();
    setGroupCallStatusBoth("idle");
  }

  function leaveGroupCall() {
    if (groupCallStatusRef.current === "idle") return;
    if (groupCallInfoRef.current) send({ type: "group-call:leave", groupId: groupCallInfoRef.current.groupId });
    cleanupGroupCall();
    setGroupCallStatusBoth("idle");
  }

  function toggleGroupMute() {
    const stream = groupLocalStreamRef.current;
    if (!stream) return;
    const next = !groupMuted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setGroupMuted(next);
  }

  function toggleGroupCamera() {
    const stream = groupLocalStreamRef.current;
    if (!stream) return;
    const next = !groupCameraOff;
    stream.getVideoTracks().forEach((t) => (t.enabled = !next));
    setGroupCameraOff(next);
  }

  async function handleSignal(msg: SignalMessage) {
    switch (msg.type) {
      case "call:invite": {
        if (!msg.from) return;
        if (statusRef.current !== "idle" || groupCallStatusRef.current !== "idle") {
          // Appel croisé : A et B s'appellent au même instant, chacun est déjà "outgoing"
          // quand l'invitation de l'autre arrive, et se rejetaient réflexivement l'un l'autre
          // (occupé) — aucun appel n'aboutissait jamais. On tranche par un ordre déterministe :
          // celui dont l'id est le plus petit devient l'appelé (bascule sur l'invitation reçue,
          // en abandonnant son propre appel sortant), l'autre reste appelant et ignore
          // silencieusement le doublon — son appel sortant continue de sonner normalement.
          const isMutualGlare = statusRef.current === "outgoing" && peerRef.current?.id === msg.from;
          if (isMutualGlare) {
            if (user && msg.from < user.id) {
              clearOutgoingTimeout();
              setError(null);
              setPeerBoth({ id: msg.from, name: msg.fromName ?? t("common.unknown") });
              setIsVideoBoth(!!msg.video);
              setStatusBoth("incoming");
            }
            return;
          }
          send({ type: "call:reject", to: msg.from });
          return;
        }
        setError(null);
        setPeerBoth({ id: msg.from, name: msg.fromName ?? t("common.unknown") });
        setIsVideoBoth(!!msg.video);
        setStatusBoth("incoming");
        break;
      }
      case "call:accept": {
        if (statusRef.current !== "outgoing" || peerRef.current?.id !== msg.from) return;
        clearOutgoingTimeout();
        setStatusBoth("connecting");
        await initiateOffer();
        break;
      }
      case "call:reject": {
        if (!msg.from || peerRef.current?.id !== msg.from) return;
        setError(t("callOverlay.rejected"));
        logMissedCall(msg.from, isVideoRef.current, "rejected");
        cleanupResources();
        setStatusBoth("idle");
        break;
      }
      case "call:cancel": {
        if (peerRef.current?.id !== msg.from) return;
        setError(t("callOverlay.cancelled"));
        cleanupResources();
        setStatusBoth("idle");
        break;
      }
      case "call:hangup": {
        if (peerRef.current?.id !== msg.from) return;
        cleanupResources();
        setStatusBoth("idle");
        break;
      }
      case "call:unavailable": {
        setError(msg.reason === "forbidden" ? t("callOverlay.forbidden") : t("callOverlay.unreachable"));
        cleanupResources();
        setStatusBoth("idle");
        break;
      }
      case "webrtc:offer": {
        if (!msg.from || !msg.sdp) return;
        if (peerRef.current?.id === msg.from) {
          await handleRemoteOffer(msg.sdp);
        } else if (groupCallStatusRef.current === "active") {
          await handleGroupRemoteOffer(msg.from, msg.fromName ?? t("common.unknown"), msg.sdp);
        }
        break;
      }
      case "webrtc:answer": {
        if (!msg.from || !msg.sdp) return;
        if (peerRef.current?.id === msg.from && pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          flushPendingCandidates();
        } else if (groupCallStatusRef.current === "active") {
          const pc = groupPeerConnectionsRef.current.get(msg.from);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            flushGroupPendingCandidates(msg.from);
          }
        }
        break;
      }
      case "webrtc:ice": {
        if (!msg.from || !msg.candidate) return;
        if (peerRef.current?.id === msg.from) {
          if (pcRef.current?.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          } else {
            pendingCandidatesRef.current.push(msg.candidate);
          }
        } else if (groupCallStatusRef.current === "active") {
          const pc = groupPeerConnectionsRef.current.get(msg.from);
          if (pc?.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          } else {
            const pending = groupPendingCandidatesRef.current.get(msg.from) ?? [];
            pending.push(msg.candidate);
            groupPendingCandidatesRef.current.set(msg.from, pending);
          }
        }
        break;
      }
      case "group-call:invite": {
        if (!msg.from || typeof msg.groupId !== "string") return;
        if (statusRef.current !== "idle" || groupCallStatusRef.current !== "idle") return;
        setError(null);
        setGroupIsVideo(!!msg.video);
        setGroupCallInfoBoth({
          groupId: msg.groupId,
          groupName: msg.groupName ?? t("common.group"),
          video: !!msg.video,
          fromName: msg.fromName,
        });
        setGroupCallStatusBoth("incoming");
        break;
      }
      case "group-call:roster": {
        // Les participants déjà présents nous enverront chacun une offre WebRTC.
        break;
      }
      case "group-call:peer-joined": {
        if (!msg.id || groupCallStatusRef.current !== "active") return;
        await initiateGroupOfferTo(msg.id, msg.name ?? t("common.unknown"));
        break;
      }
      case "group-call:peer-left": {
        if (!msg.id) return;
        closeGroupPeer(msg.id);
        break;
      }
      case "group-call:ended": {
        cleanupGroupCall();
        setGroupCallStatusBoth("idle");
        break;
      }
      case "meeting:new": {
        if (msg.meeting) setMeetingAlert(msg.meeting);
        setMeetingListVersion((v) => v + 1);
        break;
      }
      case "meeting:closed": {
        setMeetingAlert((current) => (current?.id === msg.meetingId ? null : current));
        setMeetingListVersion((v) => v + 1);
        break;
      }
      default:
        break;
    }
  }

  function dismissMeetingAlert() {
    setMeetingAlert(null);
  }

  // Permet à d'autres écrans (la salle de réunion) de réutiliser CETTE MÊME connexion au lieu
  // d'en ouvrir une deuxième : avant, ReunionRoom créait son propre WebSocket indépendant, sans
  // logique de reconnexion (contrairement à celui-ci), pour un total de deux sockets vivantes
  // par onglet. Chaque message reçu est transmis à tous les abonnés, en plus du traitement
  // interne ci-dessus (les types "meeting:*"/"webrtc:*" propres à une réunion ne sont pas
  // reconnus par le switch interne, donc ignorés silencieusement ici — sans conflit).
  const signalListenersRef = useRef<Set<(msg: SignalMessage) => void>>(new Set());
  const onSignal = useCallback((listener: (msg: SignalMessage) => void) => {
    signalListenersRef.current.add(listener);
    return () => {
      signalListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
      return;
    }
    let cancelled = false;

    function connect() {
      const token = localStorage.getItem("token");
      if (!token) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };
      ws.onmessage = (event) => {
        let parsed: SignalMessage;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return; // message non exploitable, on ignore
        }
        // handleSignal est async (setRemoteDescription, createAnswer...) : un rejet dans un
        // de ces appels (ex. SDP invalide) n'était catché par aucun try/catch synchrone et
        // devenait une rejection non gérée, laissant l'appel bloqué en "connecting" pour
        // toujours sans qu'aucun nettoyage ne se déclenche.
        handleSignal(parsed).catch((err) => {
          console.error("Erreur de signalisation d'appel :", err);
          cleanupResources();
          setStatusBoth("idle");
        });
        signalListenersRef.current.forEach((listener) => listener(parsed));
      };
      ws.onclose = () => {
        setWsConnected(false);
        if (!cancelled) {
          reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function startCall(p: CallPeer, video: boolean) {
    if (statusRef.current !== "idle" || groupCallStatusRef.current !== "idle") return;
    setError(null);
    setPeerBoth(p);
    setIsVideoBoth(video);
    setStatusBoth("outgoing");
    send({ type: "call:invite", to: p.id, video });
    outgoingTimeoutRef.current = window.setTimeout(() => {
      if (statusRef.current === "outgoing") {
        setError(t("callOverlay.noAnswer"));
        if (peerRef.current) logMissedCall(peerRef.current.id, isVideoRef.current, "no-answer");
        endCall(true);
      }
    }, OUTGOING_TIMEOUT_MS);
  }

  async function acceptCall() {
    if (statusRef.current !== "incoming" || !peerRef.current) return;
    setStatusBoth("connecting");
    send({ type: "call:accept", to: peerRef.current.id });
    createPeerConnection();
    try {
      await getLocalMedia(isVideoRef.current);
    } catch {
      setError(t("callOverlay.micError"));
      endCall(true);
    }
  }

  function hangUp() {
    endCall(true);
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
  }

  const value: CallContextValue = {
    status,
    peer,
    isVideo,
    error,
    errorKey,
    duration,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    startCall,
    acceptCall,
    hangUp,
    toggleMute,
    toggleCamera,

    groupCallStatus,
    groupCallInfo,
    groupIsVideo,
    groupParticipants,
    groupLocalStream,
    groupMuted,
    groupCameraOff,
    startGroupCall,
    joinGroupCall,
    declineGroupCall,
    leaveGroupCall,
    toggleGroupMute,
    toggleGroupCamera,

    meetingAlert,
    meetingListVersion,
    dismissMeetingAlert,

    wsConnected,
    sendSignal: send,
    onSignal,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall doit être utilisé dans un CallProvider");
  return ctx;
}
