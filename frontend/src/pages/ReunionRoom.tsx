import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ICE_SERVERS, useCall } from "../call/CallContext";
import { useGuestSignaling } from "../call/useGuestSignaling";
import { Meeting } from "../types";
import Avatar from "../components/Avatar";
import { useTranslatedText } from "../i18n/useTranslatedContent";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  Hand,
  Smile,
  MoreVertical,
  PhoneOff,
  MessageSquare,
  Users,
  Info,
  X,
  Ban,
} from "lucide-react";

type RoomState = "loading" | "not-found" | "ended" | "lobby" | "active";

const REACTIONS = ["👍", "❤️", "😂", "😮", "👏", "🎉"];

interface Participant {
  id: string;
  name: string;
  stream: MediaStream | null;
}

interface ChatEntry {
  id: string;
  name: string;
  text: string;
  self?: boolean;
}

interface SignalMessage {
  type: string;
  from?: string;
  fromName?: string;
  meetingId?: string;
  id?: string;
  name?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  participants?: { id: string; name: string }[];
  text?: string;
  raised?: boolean;
  emoji?: string;
  sharing?: boolean;
  at?: number;
}

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function Tile({
  name,
  stream,
  isSelf,
  cameraOff,
  handRaised,
  presenting,
  reaction,
  large,
}: {
  name: string;
  stream: MediaStream | null;
  isSelf?: boolean;
  cameraOff?: boolean;
  handRaised?: boolean;
  presenting?: boolean;
  reaction?: string;
  large?: boolean;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const hasVideoTrack = !cameraOff && !!stream?.getVideoTracks().some((tr) => tr.enabled);

  return (
    <div className="meet-tile" style={large ? { aspectRatio: "auto" } : undefined}>
      <video ref={videoRef} autoPlay playsInline muted={isSelf} style={{ display: hasVideoTrack ? "block" : "none" }} />
      {!hasVideoTrack && <div className="meet-tile-avatar">{name.charAt(0).toUpperCase()}</div>}
      {reaction && (
        <div className="meet-tile-reaction" key={reaction}>
          {reaction}
        </div>
      )}
      <div className="meet-tile-badges">
        {presenting && (
          <span className="meet-tile-badge" title={t("reunionRoom.presenting")}>
            <ScreenShare size={14} />
          </span>
        )}
        {handRaised && (
          <span className="meet-tile-badge" title={t("reunionRoom.raiseHand")}>
            <Hand size={14} />
          </span>
        )}
      </div>
      <div className="meet-tile-label">
        {name}
        {isSelf ? t("reunionRoom.youSuffix") : ""}
      </div>
    </div>
  );
}

export default function ReunionRoom() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  // Réutilise la connexion WebSocket déjà maintenue par CallContext pour toute l'appli, plutôt
  // que d'en ouvrir une deuxième dédiée à la réunion (l'ancienne implémentation le faisait, sans
  // logique de reconnexion — une coupure réseau pendant une réunion restait alors définitive).
  // Un invité externe sans compte (pas de `user`) n'a pas accès à cette connexion partagée
  // (CallContext ne l'ouvre que pour un utilisateur connecté) : il utilise à la place une
  // connexion dédiée, authentifiée par un token de courte durée obtenu après avoir saisi son nom.
  const authedSignaling = useCall();
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const guestSignaling = useGuestSignaling(!user ? guestToken : null);
  const { sendSignal, onSignal, wsConnected } = user ? authedSignaling : guestSignaling;

  const [guestName, setGuestName] = useState<string | null>(null);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const displayName = user?.name ?? guestName ?? t("reunion.me");

  const [roomState, setRoomState] = useState<RoomState>("loading");
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);

  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteSharerId, setRemoteSharerId] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string>>({});

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"chat" | "participants">("chat");
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [unreadChat, setUnreadChat] = useState(0);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const participantNamesRef = useRef<Map<string, string>>(new Map());
  const participantStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const screenSharingRef = useRef(false);
  const panelOpenRef = useRef(false);
  const panelTabRef = useRef<"chat" | "participants">("chat");
  const reactionTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    screenSharingRef.current = screenSharing;
  }, [screenSharing]);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);
  useEffect(() => {
    panelTabRef.current = panelTab;
  }, [panelTab]);

  const link = `${window.location.origin}/reunion/${id}`;
  const isHost = !!meeting && !!user && meeting.createdById === user.id;
  const meetingTitle = useTranslatedText(meeting?.title);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .get<Meeting>(`/meetings/${id}`)
      .then((res) => {
        if (cancelled) return;
        if (res.data.endedAt) {
          setMeeting(res.data);
          setRoomState("ended");
        } else {
          setMeeting(res.data);
          setRoomState("lobby");
        }
      })
      .catch(() => {
        if (!cancelled) setRoomState("not-found");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Filet de sécurité : coupe la caméra/micro/partage d'écran si l'utilisateur
  // quitte la page, à n'importe quel stade.
  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  useEffect(() => {
    if (roomState !== "lobby") return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        cameraStreamRef.current = stream;
        setCameraStream(stream);
      })
      .catch(() => setError(t("reunionRoom.micError")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState]);

  useEffect(() => {
    if (roomState !== "active") return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [roomState]);

  function syncParticipants() {
    const list: Participant[] = [];
    participantNamesRef.current.forEach((name, pid) => {
      list.push({ id: pid, name, stream: participantStreamsRef.current.get(pid) ?? null });
    });
    setParticipants(list);
  }

  function send(data: unknown) {
    sendSignal(data);
  }

  // Pistes actuellement envoyées aux pairs : le micro/la caméra en temps normal,
  // ou le micro + l'écran partagé pendant une présentation.
  function getOutgoingTracks(): { track: MediaStreamTrack; stream: MediaStream }[] {
    const pairs: { track: MediaStreamTrack; stream: MediaStream }[] = [];
    const cam = cameraStreamRef.current;
    if (cam) cam.getAudioTracks().forEach((track) => pairs.push({ track, stream: cam }));
    if (screenSharingRef.current && screenStreamRef.current) {
      const scr = screenStreamRef.current;
      scr.getVideoTracks().forEach((track) => pairs.push({ track, stream: scr }));
    } else if (cam) {
      cam.getVideoTracks().forEach((track) => pairs.push({ track, stream: cam }));
    }
    return pairs;
  }

  function createPeerConnection(peerId: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "webrtc:ice", to: peerId, candidate: e.candidate, meetingId: id });
    };
    pc.ontrack = (e) => {
      participantStreamsRef.current.set(peerId, e.streams[0]);
      syncParticipants();
    };
    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  }

  function flushPendingCandidates(peerId: string) {
    const pc = peerConnectionsRef.current.get(peerId);
    if (!pc) return;
    const pending = pendingCandidatesRef.current.get(peerId) ?? [];
    pending.forEach((c) => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
    pendingCandidatesRef.current.delete(peerId);
  }

  function closePeer(peerId: string) {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
    participantStreamsRef.current.delete(peerId);
    participantNamesRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    setRaisedHands((prev) => {
      if (!prev.has(peerId)) return prev;
      const next = new Set(prev);
      next.delete(peerId);
      return next;
    });
    setRemoteSharerId((prev) => (prev === peerId ? null : prev));
    syncParticipants();
  }

  async function initiateOfferTo(peerId: string, peerName: string) {
    participantNamesRef.current.set(peerId, peerName);
    const pc = createPeerConnection(peerId);
    getOutgoingTracks().forEach(({ track, stream }) => pc.addTrack(track, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "webrtc:offer", to: peerId, sdp: offer, meetingId: id });
    syncParticipants();
  }

  async function handleRemoteOffer(fromId: string, fromName: string, sdp: RTCSessionDescriptionInit) {
    participantNamesRef.current.set(fromId, fromName);
    const pc = peerConnectionsRef.current.get(fromId) ?? createPeerConnection(fromId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    flushPendingCandidates(fromId);
    getOutgoingTracks().forEach(({ track, stream }) => {
      if (!pc.getSenders().some((s) => s.track === track)) pc.addTrack(track, stream);
    });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send({ type: "webrtc:answer", to: fromId, sdp: answer, meetingId: id });
    syncParticipants();
  }

  function cleanupCall(keepLocalStream: boolean) {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    participantStreamsRef.current.clear();
    participantNamesRef.current.clear();
    pendingCandidatesRef.current.clear();
    setParticipants([]);
    setRaisedHands(new Set());
    setRemoteSharerId(null);
    if (!keepLocalStream) {
      cameraStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      cameraStreamRef.current = null;
      setCameraStream(null);
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setScreenSharing(false);
    }
  }

  function showReaction(participantId: string, emoji: string) {
    setReactions((prev) => ({ ...prev, [participantId]: emoji }));
    const prevTimer = reactionTimersRef.current.get(participantId);
    if (prevTimer) window.clearTimeout(prevTimer);
    const timer = window.setTimeout(() => {
      setReactions((prev) => {
        const next = { ...prev };
        delete next[participantId];
        return next;
      });
      reactionTimersRef.current.delete(participantId);
    }, 3000);
    reactionTimersRef.current.set(participantId, timer);
  }

  // Gère l'entrée/sortie de la salle indépendamment des reconnexions WebSocket : n'envoie
  // "meeting:leave" et ne coupe la caméra/l'écran que lorsqu'on quitte VRAIMENT la réunion
  // (changement de page ou démontage), pas à chaque reconnexion transitoire de la connexion
  // partagée (gérée séparément ci-dessous).
  useEffect(() => {
    if (roomState !== "active" || !id) return;
    return () => {
      send({ type: "meeting:leave", meetingId: id });
      cleanupCall(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState, id]);

  // (Re)joint la salle et (ré)abonne le traitement des messages à chaque fois que la connexion
  // partagée (CallContext) devient disponible — y compris après une reconnexion suite à une
  // coupure réseau, ce que l'ancien socket dédié à la réunion ne savait pas faire. Ne touche pas
  // à la caméra locale (cleanupCall(true)) : seules les connexions pair-à-pair, désormais
  // périmées après une coupure, sont réinitialisées avant de rejoindre à nouveau.
  useEffect(() => {
    if (roomState !== "active" || !id || !wsConnected) return;

    async function handleSignal(msg: SignalMessage) {
      switch (msg.type) {
        case "meeting:roster":
          break;
        case "meeting:peer-joined":
          if (msg.id) await initiateOfferTo(msg.id, msg.name ?? t("reunionRoom.unknownUser"));
          break;
        case "meeting:peer-left":
          if (msg.id) closePeer(msg.id);
          break;
        case "meeting:ended":
          cleanupCall(false);
          setRoomState("ended");
          break;
        case "meeting:chat":
          if (msg.from) {
            setChatMessages((prev) => [
              ...prev,
              { id: `${msg.at ?? Date.now()}-${msg.from}`, name: msg.fromName ?? t("reunionRoom.unknownUser"), text: msg.text ?? "" },
            ]);
            if (!panelOpenRef.current || panelTabRef.current !== "chat") setUnreadChat((n) => n + 1);
          }
          break;
        case "meeting:hand":
          if (msg.id) {
            setRaisedHands((prev) => {
              const next = new Set(prev);
              if (msg.raised) next.add(msg.id!);
              else next.delete(msg.id!);
              return next;
            });
          }
          break;
        case "meeting:reaction":
          if (msg.id && msg.emoji) showReaction(msg.id, msg.emoji);
          break;
        case "meeting:screen-share":
          if (msg.id) setRemoteSharerId(msg.sharing ? msg.id : null);
          break;
        case "webrtc:offer":
          if (msg.from && msg.sdp) await handleRemoteOffer(msg.from, msg.fromName ?? t("reunionRoom.unknownUser"), msg.sdp);
          break;
        case "webrtc:answer": {
          if (!msg.from || !msg.sdp) return;
          const pc = peerConnectionsRef.current.get(msg.from);
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            flushPendingCandidates(msg.from);
          }
          break;
        }
        case "webrtc:ice": {
          if (!msg.from || !msg.candidate) return;
          const pc = peerConnectionsRef.current.get(msg.from);
          if (pc?.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          } else {
            const pending = pendingCandidatesRef.current.get(msg.from) ?? [];
            pending.push(msg.candidate);
            pendingCandidatesRef.current.set(msg.from, pending);
          }
          break;
        }
        default:
          break;
      }
    }

    send({ type: "meeting:join", meetingId: id });
    const unsubscribe = onSignal((msg) => {
      handleSignal(msg as SignalMessage).catch((err) => {
        console.error("Erreur de signalisation de réunion :", err);
      });
    });

    return () => {
      unsubscribe();
      cleanupCall(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomState, id, wsConnected]);

  function toggleMute() {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((tr) => (tr.enabled = !next));
    setMuted(next);
  }

  function toggleCamera() {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((tr) => (tr.enabled = !next));
    setCameraOff(next);
  }

  async function startScreenShare() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = stream.getVideoTracks()[0];
      screenTrack.onended = () => stopScreenShare();
      screenStreamRef.current = stream;
      setScreenStream(stream);
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        sender?.replaceTrack(screenTrack).catch(() => {});
      });
      setScreenSharing(true);
      send({ type: "meeting:screen-share", meetingId: id, sharing: true });
    } catch {
      // sélection annulée par l'utilisateur : rien à faire
    }
  }

  function stopScreenShare() {
    screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    const camTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;
    peerConnectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) sender.replaceTrack(camTrack).catch(() => {});
    });
    setScreenSharing(false);
    send({ type: "meeting:screen-share", meetingId: id, sharing: false });
  }

  function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    send({ type: "meeting:hand", meetingId: id, raised: next });
  }

  function sendReaction(emoji: string) {
    showReaction("self", emoji);
    send({ type: "meeting:reaction", meetingId: id, emoji });
    setReactionPickerOpen(false);
  }

  function sendChat(e: FormEvent) {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;
    setChatMessages((prev) => [...prev, { id: `self-${Date.now()}`, name: displayName, text, self: true }]);
    send({ type: "meeting:chat", meetingId: id, text });
    setChatDraft("");
  }

  function openPanel(tab: "chat" | "participants") {
    setPanelTab(tab);
    setPanelOpen(true);
    if (tab === "chat") setUnreadChat(0);
  }

  async function submitGuestName(e: FormEvent) {
    e.preventDefault();
    const trimmed = guestNameInput.trim();
    if (!trimmed || !id) return;
    setGuestSubmitting(true);
    setGuestError(null);
    try {
      const res = await api.post<{ token: string; name: string }>(`/meetings/${id}/guest`, { name: trimmed });
      setGuestName(res.data.name);
      setGuestToken(res.data.token);
    } catch (err: any) {
      setGuestError(err.response?.data?.message ?? t("reunionRoom.guestJoinError"));
    } finally {
      setGuestSubmitting(false);
    }
  }

  function joinRoom() {
    setRoomState("active");
  }

  function leaveRoom() {
    navigate(user ? "/reunion" : "/login");
  }

  async function endForEveryone() {
    if (!id || !confirm(t("reunionRoom.confirmEnd"))) return;
    await api.post(`/meetings/${id}/end`);
    navigate("/reunion");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t("reunionRoom.shareLink") + " :", link);
    }
  }

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "var(--bg)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    textAlign: "center",
  };

  if (roomState === "loading") {
    return <div style={wrap}>{t("reunionRoom.loading")}</div>;
  }

  if (roomState === "not-found") {
    return (
      <div style={wrap}>
        <h2>{t("reunionRoom.notFoundTitle")}</h2>
        <p style={{ color: "var(--text-muted)" }}>{t("reunionRoom.notFoundText")}</p>
        <button className="btn btn-primary" onClick={() => navigate(user ? "/reunion" : "/login")}>
          {t("reunionRoom.back")}
        </button>
      </div>
    );
  }

  if (roomState === "ended") {
    return (
      <div style={wrap}>
        <h2>{t("reunionRoom.endedTitle")}</h2>
        <p style={{ color: "var(--text-muted)" }}>{meetingTitle}</p>
        <button className="btn btn-primary" onClick={() => navigate(user ? "/reunion" : "/login")}>
          {t("reunionRoom.back")}
        </button>
      </div>
    );
  }

  if (roomState === "lobby") {
    const needsGuestName = !user && !guestToken;
    return (
      <div className="meet-room">
        <div className="meet-stage">
          <div style={{ width: "min(420px, 90vw)" }}>
            <Tile name={displayName} stream={cameraStream} isSelf cameraOff={cameraOff} />
            <h2 style={{ margin: "16px 0 2px" }}>{meetingTitle}</h2>
            <p style={{ color: "#9aa0a6", margin: "0 0 16px", fontSize: "0.85rem" }}>
              {t("reunionRoom.organizedBy", { name: meeting?.createdBy?.name ?? t("reunionRoom.unknownUser") })}
            </p>
            {error && <p style={{ color: "#f28b82" }}>{error}</p>}

            {needsGuestName ? (
              <form onSubmit={submitGuestName} style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                <input
                  autoFocus
                  value={guestNameInput}
                  onChange={(e) => setGuestNameInput(e.target.value)}
                  placeholder={t("reunionRoom.guestNamePlaceholder")}
                  maxLength={60}
                  style={{ width: "100%", textAlign: "center" }}
                />
                {guestError && <p style={{ color: "#f28b82", margin: 0 }}>{guestError}</p>}
                <button className="btn btn-primary" type="submit" disabled={guestSubmitting || !guestNameInput.trim()}>
                  {guestSubmitting ? t("common.loading") : t("reunionRoom.guestContinue")}
                </button>
              </form>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 18 }}>
                  <button
                    className={`meet-btn ${muted ? "meet-btn-off" : ""}`}
                    style={{ background: muted ? undefined : "#3c4043" }}
                    onClick={toggleMute}
                    title={muted ? t("reunionRoom.enableMic") : t("reunionRoom.disableMic")}
                  >
                    {muted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                  <button
                    className={`meet-btn ${cameraOff ? "meet-btn-off" : ""}`}
                    style={{ background: cameraOff ? undefined : "#3c4043" }}
                    onClick={toggleCamera}
                    title={cameraOff ? t("reunionRoom.enableCamera") : t("reunionRoom.disableCamera")}
                  >
                    {cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                  <button className="btn btn-primary" onClick={joinRoom}>
                    {t("reunionRoom.join")}
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={copyLink}
                    style={{ background: "transparent", color: "#e8eaed", borderColor: "rgba(255,255,255,0.3)" }}
                  >
                    {copied ? t("reunionRoom.linkCopied") : t("reunionRoom.shareLink")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // active
  const tileCount = participants.length + 1;
  const columns = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : 3;

  const sharer =
    screenSharing
      ? { id: "self", name: displayName, stream: screenStream, isSelf: true }
      : remoteSharerId
        ? (() => {
            const p = participants.find((pp) => pp.id === remoteSharerId);
            return p ? { id: p.id, name: p.name, stream: p.stream, isSelf: false } : null;
          })()
        : null;

  return (
    <div className="meet-room">
      <div className="meet-topbar">
        <span>
          {formatElapsed(elapsed)} · {meetingTitle}
        </span>
        <div className="meet-topbar-right" style={{ position: "relative" }}>
          <button className="meet-icon-btn" title={t("reunionRoom.meetingInfo")} onClick={() => setInfoOpen((v) => !v)}>
            <Info size={18} />
          </button>
          {infoOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                background: "#3c4043",
                borderRadius: 12,
                padding: 16,
                width: 260,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                textAlign: "left",
                zIndex: 20,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{meetingTitle}</div>
              <div style={{ color: "#9aa0a6", fontSize: "0.8rem", marginBottom: 12 }}>
                {t("reunionRoom.organizedBy", { name: meeting?.createdBy?.name ?? t("reunionRoom.unknownUser") })}
              </div>
              <button className="btn btn-outline" style={{ width: "100%", background: "transparent", color: "#e8eaed", borderColor: "rgba(255,255,255,0.3)" }} onClick={copyLink}>
                {copied ? t("reunionRoom.linkCopied") : t("reunionRoom.copyLink")}
              </button>
            </div>
          )}
          <Avatar name={displayName} avatar={user?.avatar} size={32} />
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div className="meet-stage">
          {sharer ? (
            <div className="meet-spotlight">
              <div className="meet-spotlight-main">
                <Tile name={sharer.name} stream={sharer.stream} isSelf={sharer.isSelf} presenting large />
              </div>
              <div className="meet-spotlight-strip">
                {sharer.id !== "self" && (
                  <Tile name={displayName} stream={cameraStream} isSelf cameraOff={cameraOff} handRaised={handRaised} reaction={reactions["self"]} />
                )}
                {participants
                  .filter((p) => p.id !== sharer.id)
                  .map((p) => (
                    <Tile key={p.id} name={p.name} stream={p.stream} handRaised={raisedHands.has(p.id)} reaction={reactions[p.id]} />
                  ))}
              </div>
            </div>
          ) : (
            <div className="meet-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(160px, 1fr))` }}>
              <Tile
                name={displayName}
                stream={cameraStream}
                isSelf
                cameraOff={cameraOff}
                handRaised={handRaised}
                reaction={reactions["self"]}
              />
              {participants.map((p) => (
                <Tile key={p.id} name={p.name} stream={p.stream} handRaised={raisedHands.has(p.id)} reaction={reactions[p.id]} />
              ))}
            </div>
          )}
        </div>

        {panelOpen && (
          <div className="meet-panel">
            <div className="meet-panel-tabs">
              <button className={`meet-panel-tab ${panelTab === "chat" ? "active" : ""}`} onClick={() => openPanel("chat")}>
                {t("reunionRoom.chat")}
              </button>
              <button className={`meet-panel-tab ${panelTab === "participants" ? "active" : ""}`} onClick={() => openPanel("participants")}>
                {t("reunionRoom.participantsTab")} ({tileCount})
              </button>
              <button className="meet-icon-btn" style={{ marginRight: 8 }} onClick={() => setPanelOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {panelTab === "chat" ? (
              <>
                <div className="meet-panel-body">
                  {chatMessages.length === 0 ? (
                    <p style={{ color: "#9aa0a6", fontSize: "0.85rem" }}>{t("reunionRoom.noMessages")}</p>
                  ) : (
                    chatMessages.map((m) => (
                      <div key={m.id} className="meet-chat-message">
                        <div className="meet-chat-name">{m.self ? t("messenger.you") : m.name}</div>
                        <div className="meet-chat-bubble">{m.text}</div>
                      </div>
                    ))
                  )}
                </div>
                <form className="meet-chat-form" onSubmit={sendChat}>
                  <input
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder={t("reunionRoom.chatPlaceholder")}
                  />
                  <button type="submit" title={t("messenger.send")}>
                    ➤
                  </button>
                </form>
              </>
            ) : (
              <div className="meet-panel-body">
                <div className="meet-participant-row">
                  <div className="meet-tile-avatar">{displayName.charAt(0).toUpperCase()}</div>
                  <span>
                    {displayName}
                    {t("reunionRoom.youSuffix")}
                  </span>
                  {handRaised && (
                    <span style={{ marginLeft: "auto", display: "flex" }}>
                      <Hand size={16} />
                    </span>
                  )}
                </div>
                {participants.map((p) => (
                  <div key={p.id} className="meet-participant-row">
                    <div className="meet-tile-avatar">{p.name.charAt(0).toUpperCase()}</div>
                    <span>{p.name}</span>
                    {raisedHands.has(p.id) && (
                      <span style={{ marginLeft: "auto", display: "flex" }}>
                        <Hand size={16} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="meet-toolbar-row">
        <div className="meet-toolbar">
          <button
            className={`meet-btn ${muted ? "meet-btn-off" : ""}`}
            onClick={toggleMute}
            title={muted ? t("reunionRoom.enableMic") : t("reunionRoom.disableMic")}
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button
            className={`meet-btn ${cameraOff ? "meet-btn-off" : ""}`}
            onClick={toggleCamera}
            title={cameraOff ? t("reunionRoom.enableCamera") : t("reunionRoom.disableCamera")}
          >
            {cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button
            className={`meet-btn ${screenSharing ? "meet-btn-active" : ""}`}
            onClick={() => (screenSharing ? stopScreenShare() : startScreenShare())}
            title={screenSharing ? t("reunionRoom.screenShareStop") : t("reunionRoom.screenShareStart")}
          >
            {screenSharing ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}
          </button>
          <button
            className={`meet-btn ${handRaised ? "meet-btn-active" : ""}`}
            onClick={toggleHand}
            title={handRaised ? t("reunionRoom.lowerHand") : t("reunionRoom.raiseHand")}
          >
            <Hand size={20} />
          </button>
          <div style={{ position: "relative" }}>
            <button className="meet-btn" onClick={() => setReactionPickerOpen((v) => !v)} title={t("reunionRoom.reactions")}>
              <Smile size={20} />
            </button>
            {reactionPickerOpen && (
              <div className="meet-reaction-picker">
                {REACTIONS.map((emoji) => (
                  <button key={emoji} onClick={() => sendReaction(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          {isHost && (
            <div style={{ position: "relative" }}>
              <button className="meet-btn" onClick={() => setMoreMenuOpen((v) => !v)} title={t("reunionRoom.moreOptions")}>
                <MoreVertical size={20} />
              </button>
              {moreMenuOpen && (
                <div className="meet-more-menu">
                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      endForEveryone();
                    }}
                  >
                    <Ban size={16} />
                    {t("reunionRoom.endForEveryone")}
                  </button>
                </div>
              )}
            </div>
          )}
          <button className="meet-btn meet-btn-hangup" onClick={leaveRoom} title={t("reunionRoom.leave")}>
            <PhoneOff size={20} />
          </button>
        </div>

        <div className="meet-side-icons">
          <button className="meet-btn" onClick={() => openPanel("chat")} title={t("reunionRoom.chat")}>
            <MessageSquare size={20} />
            {unreadChat > 0 && <span className="badge-notify" style={{ position: "absolute", top: -2, right: -2 }}>{unreadChat}</span>}
          </button>
          <button className="meet-btn" onClick={() => openPanel("participants")} title={t("reunionRoom.participantsTab")}>
            <Users size={20} /> {tileCount}
          </button>
        </div>
      </div>
    </div>
  );
}
