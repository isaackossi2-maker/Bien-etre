import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate } from "../middleware/auth";
import { logAction } from "../utils/log";
import { Role } from "@prisma/client";

const router = Router();
router.use(authenticate);

// Contacts disponibles pour discuter :
// - Un admin peut écrire à n'importe quel autre utilisateur (admin ou utilisateur)
// - Un utilisateur ne peut écrire qu'aux administrateurs
router.get("/contacts", async (req, res) => {
  const where = req.user!.role === "ADMIN" ? { id: { not: req.user!.id } } : { role: "ADMIN" as Role };

  const contacts = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, avatar: true },
  });

  const [asSender, asRecipient, unread] = await Promise.all([
    prisma.message.groupBy({ by: ["recipientId"], where: { senderId: req.user!.id }, _max: { createdAt: true } }),
    prisma.message.groupBy({ by: ["senderId"], where: { recipientId: req.user!.id }, _max: { createdAt: true } }),
    prisma.message.groupBy({
      by: ["senderId"],
      where: { recipientId: req.user!.id, readAt: null },
      _count: { _all: true },
    }),
  ]);

  const lastMap = new Map<string, Date>();
  const consider = (otherId: string, date: Date | null) => {
    if (!date) return;
    const existing = lastMap.get(otherId);
    if (!existing || date > existing) lastMap.set(otherId, date);
  };
  asSender.forEach((m) => consider(m.recipientId, m._max.createdAt));
  asRecipient.forEach((m) => consider(m.senderId, m._max.createdAt));

  const unreadMap = new Map(unread.map((m) => [m.senderId, m._count._all]));

  const shaped = contacts
    .map((c) => ({ ...c, lastMessageAt: lastMap.get(c.id) ?? null, unreadCount: unreadMap.get(c.id) ?? 0 }))
    .sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) {
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      }
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.name.localeCompare(b.name);
    });

  res.json(shaped);
});

// Nombre total de messages non lus pour l'utilisateur courant (badge de notification)
router.get("/unread-count", async (req, res) => {
  const count = await prisma.message.count({ where: { recipientId: req.user!.id, readAt: null } });
  res.json({ count });
});

async function canConverseWith(currentUser: { id: string; role: Role }, otherUserId: string) {
  if (currentUser.id === otherUserId) return false;
  if (currentUser.role === "ADMIN") return true;
  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  return other?.role === "ADMIN";
}

router.get("/thread/:userId", async (req, res) => {
  if (!(await canConverseWith(req.user!, req.params.userId))) {
    return res.status(403).json({ message: "Accès refusé" });
  }

  await prisma.message.updateMany({
    where: { senderId: req.params.userId, recipientId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: req.user!.id, recipientId: req.params.userId },
        { senderId: req.params.userId, recipientId: req.user!.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, role: true, avatar: true } } },
  });
  res.json(messages);
});

const messageSchema = z
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

router.post("/thread/:userId", async (req, res) => {
  if (!(await canConverseWith(req.user!, req.params.userId))) {
    return res.status(403).json({ message: "Accès refusé" });
  }
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }

  const recipient = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!recipient) return res.status(404).json({ message: "Destinataire introuvable" });

  const isAudio = !!parsed.data.audioData;
  const isFile = !isAudio && !!parsed.data.fileData;
  const message = await prisma.message.create({
    data: {
      senderId: req.user!.id,
      recipientId: req.params.userId,
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
  await logAction(
    req.user!.id,
    "MESSAGE_SEND",
    isAudio ? `Message vocal envoyé à ${recipient.name}` : isFile ? `Fichier envoyé à ${recipient.name}` : `Message envoyé à ${recipient.name}`
  );
  res.status(201).json(message);
});

export default router;
