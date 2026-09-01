import { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { verifyToken } from "./middleware/auth";
import { prisma } from "./prisma";
import { canContact } from "./utils/permissions";
import { Role } from "@prisma/client";

interface SignalMessage {
  type: string;
  to?: string;
  [key: string]: unknown;
}

// Contexte transmis à chaque handler : qui envoie le message et sur quel socket, pour que
// chaque handler reste une fonction pure plutôt qu'une closure imbriquée dans "message".
interface HandlerCtx {
  ws: WebSocket;
  userId: string;
  role: Role;
  name: string;
  msg: SignalMessage;
}

type Handler = (ctx: HandlerCtx) => void | Promise<void>;

const connections = new Map<string, Set<WebSocket>>();

// État en mémoire des appels de groupe en cours : groupId -> (userId -> nom).
const groupCallRooms = new Map<string, Map<string, string>>();

// État en mémoire des réunions en cours (participants connectés) : meetingId -> (userId -> nom).
// Contrairement aux appels de groupe, l'accès n'est pas limité à une liste de membres :
// n'importe quel utilisateur authentifié possédant le lien peut rejoindre la réunion.
const meetingRooms = new Map<string, Map<string, string>>();

// Salles (appels de groupe / réunions) rejointes par CHAQUE socket individuellement, pas par
// utilisateur : sert à ne quitter une salle que quand l'onglet qui l'a rejointe se ferme, pas
// seulement quand le DERNIER onglet de l'utilisateur se ferme (cas d'un utilisateur multi-onglets).
const socketRooms = new Map<WebSocket, { groups: Set<string>; meetings: Set<string> }>();

function getSocketRooms(ws: WebSocket) {
  let rooms = socketRooms.get(ws);
  if (!rooms) {
    rooms = { groups: new Set(), meetings: new Set() };
    socketRooms.set(ws, rooms);
  }
  return rooms;
}

function addConnection(userId: string, ws: WebSocket) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId)!.add(ws);
}

function removeConnection(userId: string, ws: WebSocket) {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
}

function sendTo(userId: string, data: unknown): boolean {
  const set = connections.get(userId);
  if (!set || set.size === 0) return false;
  const payload = JSON.stringify(data);
  let delivered = false;
  set.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      delivered = true;
    }
  });
  return delivered;
}

async function isGroupMember(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  return !!membership;
}

// Un seul aller-retour DB : la liste des membres sert à la fois à vérifier l'appartenance
// (isMember) et à obtenir les destinataires à qui diffuser l'invitation.
async function groupMembership(groupId: string, userId: string): Promise<{ isMember: boolean; memberIds: string[] }> {
  const members = await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
  const memberIds = members.map((m) => m.userId);
  return { isMember: memberIds.includes(userId), memberIds };
}

// Quitte une salle (appel de groupe ou réunion) pour CE socket précis. Si l'utilisateur a un
// autre onglet encore dans la même salle, on ne le retire pas du roster ni ne prévient les
// autres participants — seul le dernier onglet présent dans cette salle doit déclencher le départ.
function leaveRoomsForSocket(userId: string, ws: WebSocket) {
  const rooms = socketRooms.get(ws);
  socketRooms.delete(ws);
  if (!rooms) return;

  const otherSockets = [...(connections.get(userId) ?? [])];
  const stillIn = (kind: "groups" | "meetings", id: string) =>
    otherSockets.some((s) => socketRooms.get(s)?.[kind].has(id));

  rooms.groups.forEach((groupId) => {
    if (stillIn("groups", groupId)) return;
    const room = groupCallRooms.get(groupId);
    if (room?.has(userId)) {
      room.delete(userId);
      room.forEach((_, id) => sendTo(id, { type: "group-call:peer-left", groupId, id: userId }));
      if (room.size === 0) groupCallRooms.delete(groupId);
    }
  });

  rooms.meetings.forEach((meetingId) => {
    if (stillIn("meetings", meetingId)) return;
    const room = meetingRooms.get(meetingId);
    if (room?.has(userId)) {
      room.delete(userId);
      room.forEach((_, id) => sendTo(id, { type: "meeting:peer-left", meetingId, id: userId }));
      if (room.size === 0) meetingRooms.delete(meetingId);
    }
  });
}

// Appelé quand l'organisateur termine la réunion via l'API HTTP : prévient tous
// les participants actuellement connectés et vide la salle.
export function endMeetingRoom(meetingId: string) {
  const room = meetingRooms.get(meetingId);
  if (!room) return;
  room.forEach((_, id) => sendTo(id, { type: "meeting:ended", meetingId }));
  meetingRooms.delete(meetingId);
}

// Prévient tous les utilisateurs connectés (sauf le créateur) qu'une nouvelle
// réunion est disponible, pour qu'ils puissent la rejoindre sans avoir le lien.
export function broadcastMeetingCreated(meeting: { id: string; title: string; createdAt: Date }, creatorId: string, creatorName: string) {
  connections.forEach((_set, id) => {
    if (id === creatorId) return;
    sendTo(id, {
      type: "meeting:new",
      meeting: {
        id: meeting.id,
        title: meeting.title,
        createdAt: meeting.createdAt,
        createdById: creatorId,
        createdBy: { id: creatorId, name: creatorName },
      },
    });
  });
}

// Prévient tous les utilisateurs connectés qu'une réunion n'est plus disponible
// (pour faire disparaître une éventuelle notification affichée ailleurs que dans la salle).
export function broadcastMeetingClosed(meetingId: string) {
  connections.forEach((_set, id) => sendTo(id, { type: "meeting:closed", meetingId }));
}

// ---------- Handlers : un par type de message, dispatché depuis le registre en bas de fichier ----------

async function handleGroupCallInvite({ ws, userId, name, msg }: HandlerCtx) {
  if (typeof msg.groupId !== "string") return;
  const groupId = msg.groupId;
  const { isMember, memberIds } = await groupMembership(groupId, userId);
  if (!isMember) return;
  if (!groupCallRooms.has(groupId)) groupCallRooms.set(groupId, new Map());
  const room = groupCallRooms.get(groupId)!;
  room.set(userId, name);
  getSocketRooms(ws).groups.add(groupId);
  memberIds
    .filter((id) => id !== userId)
    .forEach((id) =>
      sendTo(id, {
        type: "group-call:invite",
        groupId,
        groupName: msg.groupName,
        video: !!msg.video,
        from: userId,
        fromName: name,
      })
    );
}

async function handleGroupCallJoin({ ws, userId, name, msg }: HandlerCtx) {
  if (typeof msg.groupId !== "string") return;
  const groupId = msg.groupId;
  if (!(await isGroupMember(groupId, userId))) return;
  const room = groupCallRooms.get(groupId);
  if (!room || room.size === 0) {
    sendTo(userId, { type: "group-call:ended", groupId });
    return;
  }
  const roster = Array.from(room.entries())
    .filter(([id]) => id !== userId)
    .map(([id, nm]) => ({ id, name: nm }));
  room.set(userId, name);
  getSocketRooms(ws).groups.add(groupId);
  sendTo(userId, { type: "group-call:roster", groupId, participants: roster });
  roster.forEach(({ id }) => sendTo(id, { type: "group-call:peer-joined", groupId, id: userId, name }));
}

function handleGroupCallLeave({ ws, userId, msg }: HandlerCtx) {
  if (typeof msg.groupId !== "string") return;
  const groupId = msg.groupId;
  getSocketRooms(ws).groups.delete(groupId);
  const room = groupCallRooms.get(groupId);
  if (room?.has(userId)) {
    room.delete(userId);
    room.forEach((_, id) => sendTo(id, { type: "group-call:peer-left", groupId, id: userId }));
    if (room.size === 0) groupCallRooms.delete(groupId);
  }
}

async function handleMeetingJoin({ ws, userId, name, msg }: HandlerCtx) {
  if (typeof msg.meetingId !== "string") return;
  const meetingId = msg.meetingId;
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  if (!meeting || meeting.endedAt) {
    sendTo(userId, { type: "meeting:ended", meetingId });
    return;
  }
  if (!meetingRooms.has(meetingId)) meetingRooms.set(meetingId, new Map());
  const room = meetingRooms.get(meetingId)!;
  const roster = Array.from(room.entries())
    .filter(([id]) => id !== userId)
    .map(([id, nm]) => ({ id, name: nm }));
  room.set(userId, name);
  getSocketRooms(ws).meetings.add(meetingId);
  // Trace persistante du passage, pour distinguer plus tard les réunions manquées.
  await prisma.meetingParticipant
    .upsert({ where: { meetingId_userId: { meetingId, userId } }, update: {}, create: { meetingId, userId } })
    .catch(() => {});
  sendTo(userId, { type: "meeting:roster", meetingId, participants: roster });
  roster.forEach(({ id }) => sendTo(id, { type: "meeting:peer-joined", meetingId, id: userId, name }));
}

function handleMeetingLeave({ ws, userId, msg }: HandlerCtx) {
  if (typeof msg.meetingId !== "string") return;
  const meetingId = msg.meetingId;
  getSocketRooms(ws).meetings.delete(meetingId);
  const room = meetingRooms.get(meetingId);
  if (room?.has(userId)) {
    room.delete(userId);
    room.forEach((_, id) => sendTo(id, { type: "meeting:peer-left", meetingId, id: userId }));
    if (room.size === 0) meetingRooms.delete(meetingId);
  }
}

// Chat texte, main levée, réactions et partage d'écran pendant une réunion : diffusés en
// direct aux autres participants de la salle, sans persistance (contrairement à la
// messagerie, ce sont des échanges éphémères liés à l'appel).
function handleMeetingChat({ userId, name, msg }: HandlerCtx) {
  if (typeof msg.meetingId !== "string" || typeof msg.text !== "string") return;
  const meetingId = msg.meetingId;
  const room = meetingRooms.get(meetingId);
  if (!room || !room.has(userId)) return;
  const text = msg.text.trim().slice(0, 2000);
  if (!text) return;
  room.forEach((_, id) => {
    if (id !== userId) sendTo(id, { type: "meeting:chat", meetingId, from: userId, fromName: name, text, at: Date.now() });
  });
}

function handleMeetingHand({ userId, msg }: HandlerCtx) {
  if (typeof msg.meetingId !== "string") return;
  const meetingId = msg.meetingId;
  const room = meetingRooms.get(meetingId);
  if (!room || !room.has(userId)) return;
  const raised = !!msg.raised;
  room.forEach((_, id) => {
    if (id !== userId) sendTo(id, { type: "meeting:hand", meetingId, id: userId, raised });
  });
}

function handleMeetingReaction({ userId, msg }: HandlerCtx) {
  if (typeof msg.meetingId !== "string" || typeof msg.emoji !== "string") return;
  const meetingId = msg.meetingId;
  const room = meetingRooms.get(meetingId);
  if (!room || !room.has(userId)) return;
  const emoji = msg.emoji.slice(0, 8);
  room.forEach((_, id) => {
    if (id !== userId) sendTo(id, { type: "meeting:reaction", meetingId, id: userId, emoji });
  });
}

function handleMeetingScreenShare({ userId, msg }: HandlerCtx) {
  if (typeof msg.meetingId !== "string") return;
  const meetingId = msg.meetingId;
  const room = meetingRooms.get(meetingId);
  if (!room || !room.has(userId)) return;
  const sharing = !!msg.sharing;
  room.forEach((_, id) => {
    if (id !== userId) sendTo(id, { type: "meeting:screen-share", meetingId, id: userId, sharing });
  });
}

// Appels 1:1 (invitation + signalisation WebRTC brute) : simple relais vers le destinataire,
// après vérification systématique de la règle "un utilisateur ne peut contacter qu'un
// administrateur" — appliquée à CHAQUE type, pas seulement à l'invitation initiale, sans quoi
// un client pouvait envoyer une offer/answer/ice directement en contournant la règle.
async function handleCallRelay({ userId, role, name, msg }: HandlerCtx) {
  if (typeof msg.to !== "string") return;
  const allowed = await canContact(userId, role, msg.to);
  if (!allowed) {
    if (msg.type === "call:invite") sendTo(userId, { type: "call:unavailable", from: msg.to, reason: "forbidden" });
    return;
  }
  const delivered = sendTo(msg.to, { ...msg, from: userId, fromName: name });
  if (!delivered && msg.type === "call:invite") {
    sendTo(userId, { type: "call:unavailable", from: msg.to, reason: "offline" });
  }
}

const handlers: Record<string, Handler> = {
  "group-call:invite": handleGroupCallInvite,
  "group-call:join": handleGroupCallJoin,
  "group-call:leave": handleGroupCallLeave,
  "meeting:join": handleMeetingJoin,
  "meeting:leave": handleMeetingLeave,
  "meeting:chat": handleMeetingChat,
  "meeting:hand": handleMeetingHand,
  "meeting:reaction": handleMeetingReaction,
  "meeting:screen-share": handleMeetingScreenShare,
  "call:invite": handleCallRelay,
  "call:accept": handleCallRelay,
  "call:reject": handleCallRelay,
  "call:cancel": handleCallRelay,
  "call:hangup": handleCallRelay,
  "webrtc:offer": handleCallRelay,
  "webrtc:answer": handleCallRelay,
  "webrtc:ice": handleCallRelay,
};

export function setupSignaling(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4001, "Token manquant");
      return;
    }

    let userId: string;
    let role: Role;
    let name: string;
    try {
      const payload = verifyToken(token);
      userId = payload.id;
      role = payload.role;
      name = payload.name;
    } catch {
      ws.close(4002, "Token invalide");
      return;
    }

    addConnection(userId, ws);

    ws.on("message", async (raw) => {
      let msg: SignalMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg.type) return;
      const handler = handlers[msg.type];
      if (handler) await handler({ ws, userId, role, name, msg });
    });

    ws.on("close", () => {
      removeConnection(userId, ws);
      leaveRoomsForSocket(userId, ws);
    });
  });

  return wss;
}
