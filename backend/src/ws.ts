import { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { verifyToken } from "./middleware/auth";
import { prisma } from "./prisma";
import { Role } from "@prisma/client";

interface SignalMessage {
  type: string;
  to?: string;
  [key: string]: unknown;
}

const RELAY_TYPES = new Set([
  "call:invite",
  "call:accept",
  "call:reject",
  "call:cancel",
  "call:hangup",
  "webrtc:offer",
  "webrtc:answer",
  "webrtc:ice",
]);

const connections = new Map<string, Set<WebSocket>>();

// État en mémoire des appels de groupe en cours : groupId -> (userId -> nom).
const groupCallRooms = new Map<string, Map<string, string>>();

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

// Mêmes règles que la messagerie : un admin peut appeler n'importe qui,
// un utilisateur ne peut appeler qu'un administrateur.
async function canCall(fromId: string, fromRole: Role, toId: string) {
  if (fromId === toId) return false;
  if (fromRole === "ADMIN") return true;
  const other = await prisma.user.findUnique({ where: { id: toId } });
  return other?.role === "ADMIN";
}

async function isGroupMember(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  return !!membership;
}

async function groupMemberIds(groupId: string): Promise<string[]> {
  const members = await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

// Retire l'utilisateur de tous les appels de groupe auxquels il participe et
// prévient les autres participants pour qu'ils ferment leur connexion vers lui.
function leaveAllGroupCalls(userId: string) {
  groupCallRooms.forEach((participants, groupId) => {
    if (!participants.has(userId)) return;
    participants.delete(userId);
    participants.forEach((_, otherId) => sendTo(otherId, { type: "group-call:peer-left", groupId, id: userId }));
    if (participants.size === 0) groupCallRooms.delete(groupId);
  });
}

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

      if (msg.type === "group-call:invite" && typeof msg.groupId === "string") {
        const groupId = msg.groupId;
        if (!(await isGroupMember(groupId, userId))) return;
        if (!groupCallRooms.has(groupId)) groupCallRooms.set(groupId, new Map());
        const room = groupCallRooms.get(groupId)!;
        room.set(userId, name);
        const memberIds = await groupMemberIds(groupId);
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
        return;
      }

      if (msg.type === "group-call:join" && typeof msg.groupId === "string") {
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
        sendTo(userId, { type: "group-call:roster", groupId, participants: roster });
        roster.forEach(({ id }) => sendTo(id, { type: "group-call:peer-joined", groupId, id: userId, name }));
        return;
      }

      if (msg.type === "group-call:leave" && typeof msg.groupId === "string") {
        const groupId = msg.groupId;
        const room = groupCallRooms.get(groupId);
        if (room?.has(userId)) {
          room.delete(userId);
          room.forEach((_, id) => sendTo(id, { type: "group-call:peer-left", groupId, id: userId }));
          if (room.size === 0) groupCallRooms.delete(groupId);
        }
        return;
      }

      if (!RELAY_TYPES.has(msg.type) || typeof msg.to !== "string") return;

      if (msg.type === "call:invite") {
        const allowed = await canCall(userId, role, msg.to);
        if (!allowed) {
          sendTo(userId, { type: "call:unavailable", from: msg.to, reason: "forbidden" });
          return;
        }
      }

      const delivered = sendTo(msg.to, { ...msg, from: userId, fromName: name });
      if (!delivered && msg.type === "call:invite") {
        sendTo(userId, { type: "call:unavailable", from: msg.to, reason: "offline" });
      }
    });

    ws.on("close", () => {
      removeConnection(userId, ws);
      if (!connections.has(userId)) {
        leaveAllGroupCalls(userId);
      }
    });
  });

  return wss;
}
