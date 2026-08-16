import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate } from "../middleware/auth";
import { logAction } from "../utils/log";

const router = Router();
router.use(authenticate);

// Annuaire des utilisateurs pour choisir avec qui démarrer une discussion ou un groupe
router.get("/directory", async (req, res) => {
  const users = await prisma.user.findMany({
    where: { id: { not: req.user!.id } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, avatar: true },
  });
  res.json(users);
});

router.get("/", async (req, res) => {
  const memberships = await prisma.groupMember.findMany({
    where: { userId: req.user!.id },
    include: {
      group: {
        include: {
          members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
      },
    },
  });

  const groups = memberships
    .map(({ group }) => ({
      id: group.id,
      name: group.name,
      avatar: group.avatar,
      memberCount: group.members.length,
      members: group.members.map((m) => m.user),
      lastMessageAt: group.messages[0]?.createdAt ?? group.createdAt,
    }))
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  res.json(groups);
});

const createGroupSchema = z.object({
  name: z.string().min(1),
  memberIds: z.array(z.string()).min(1),
  avatar: z.string().nullable().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }
  const memberIds = Array.from(new Set([...parsed.data.memberIds, req.user!.id]));

  const group = await prisma.group.create({
    data: {
      name: parsed.data.name,
      avatar: parsed.data.avatar ?? null,
      createdById: req.user!.id,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
    include: { members: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
  });

  await logAction(req.user!.id, "GROUP_CREATE", `Création du groupe "${group.name}"`);
  res.status(201).json({
    id: group.id,
    name: group.name,
    avatar: group.avatar,
    memberCount: group.members.length,
    members: group.members.map((m) => m.user),
    lastMessageAt: group.createdAt,
  });
});

async function requireMember(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  return !!membership;
}

const updateGroupSchema = z.object({
  avatar: z.string().nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  if (!(await requireMember(req.params.id, req.user!.id))) {
    return res.status(403).json({ message: "Accès refusé" });
  }
  const parsed = updateGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }
  const group = await prisma.group.update({
    where: { id: req.params.id },
    data: { avatar: parsed.data.avatar },
  });
  res.json({ id: group.id, avatar: group.avatar });
});

router.get("/:id/messages", async (req, res) => {
  if (!(await requireMember(req.params.id, req.user!.id))) {
    return res.status(403).json({ message: "Accès refusé" });
  }
  const messages = await prisma.groupMessage.findMany({
    where: { groupId: req.params.id },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, role: true, avatar: true } } },
  });
  res.json(messages);
});

const groupMessageSchema = z
  .object({
    content: z.string().min(1).optional(),
    audioData: z.string().min(1).optional(),
    audioDuration: z.number().int().positive().optional(),
    fileData: z.string().min(1).optional(),
    fileName: z.string().min(1).optional(),
    fileMimeType: z.string().min(1).optional(),
  })
  .refine((d) => (d.content && d.content.trim().length > 0) || d.audioData || d.fileData, {
    message: "Le message doit contenir du texte, un audio ou un fichier",
  });

router.post("/:id/messages", async (req, res) => {
  if (!(await requireMember(req.params.id, req.user!.id))) {
    return res.status(403).json({ message: "Accès refusé" });
  }
  const parsed = groupMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }

  const isAudio = !!parsed.data.audioData;
  const isFile = !isAudio && !!parsed.data.fileData;
  const message = await prisma.groupMessage.create({
    data: {
      groupId: req.params.id,
      senderId: req.user!.id,
      type: isAudio ? "AUDIO" : isFile ? "FILE" : "TEXT",
      content: isAudio || isFile ? null : parsed.data.content,
      audioData: isAudio ? parsed.data.audioData : null,
      audioDuration: isAudio ? parsed.data.audioDuration : null,
      fileData: isFile ? parsed.data.fileData : null,
      fileName: isFile ? parsed.data.fileName : null,
      fileMimeType: isFile ? parsed.data.fileMimeType : null,
    },
    include: { sender: { select: { id: true, name: true, role: true, avatar: true } } },
  });
  res.status(201).json(message);
});

export default router;
