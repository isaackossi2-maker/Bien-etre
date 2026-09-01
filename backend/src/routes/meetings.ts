import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logAction } from "../utils/log";
import { endMeetingRoom, broadcastMeetingCreated, broadcastMeetingClosed } from "../ws";

const MISSED_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const router = Router();
router.use(authenticate);

// Réunions actives, toutes confondues : n'importe quel utilisateur connecté doit
// pouvoir les voir et les rejoindre, pas seulement celui qui les a créées.
router.get("/", async (req, res) => {
  const meetings = await prisma.meeting.findMany({
    where: { endedAt: null },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json(meetings);
});

// Réunions terminées que l'utilisateur n'a jamais rejointes et qu'il n'a pas
// lui-même organisées : à afficher côté utilisateur comme "réunions manquées".
router.get("/missed", async (req, res) => {
  const meetings = await prisma.meeting.findMany({
    where: {
      endedAt: { not: null, gte: new Date(Date.now() - MISSED_LOOKBACK_MS) },
      createdById: { not: req.user!.id },
      participants: { none: { userId: req.user!.id } },
    },
    orderBy: { endedAt: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json(meetings);
});

const createMeetingSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

// Seuls les admins organisent des réunions ; les utilisateurs les rejoignent.
router.post("/", requireRole("ADMIN"), validateBody(createMeetingSchema), async (req, res) => {
  const { title } = req.body as z.infer<typeof createMeetingSchema>;
  const meeting = await prisma.meeting.create({
    data: {
      title: title || `Réunion de ${req.user!.name}`,
      createdById: req.user!.id,
    },
  });
  await logAction(req.user!.id, "MEETING_CREATE", `Création de la réunion "${meeting.title}"`);
  broadcastMeetingCreated(meeting, req.user!.id, req.user!.name);
  res.status(201).json(meeting);
});

// N'importe quel utilisateur connecté ayant le lien peut consulter ces infos avant de rejoindre.
router.get("/:id", async (req, res) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!meeting) {
    return res.status(404).json({ message: "Réunion introuvable" });
  }
  res.json(meeting);
});

router.post("/:id/end", async (req, res) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: req.params.id } });
  if (!meeting) {
    return res.status(404).json({ message: "Réunion introuvable" });
  }
  if (meeting.createdById !== req.user!.id) {
    return res.status(403).json({ message: "Seul l'organisateur peut terminer la réunion" });
  }
  const updated = await prisma.meeting.update({ where: { id: meeting.id }, data: { endedAt: new Date() } });
  endMeetingRoom(meeting.id);
  broadcastMeetingClosed(meeting.id);
  await logAction(req.user!.id, "MEETING_END", `Fin de la réunion "${meeting.title}"`);
  res.json(updated);
});

export default router;
