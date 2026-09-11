import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logAction } from "../utils/log";
import { userSummarySelect } from "../utils/selects";
import meditationVerses from "../data/meditationVerses.json";

const router = Router();
router.use(authenticate);

const DAILY_VERSE_ID = "current";
const DAILY_VERSE_TTL_MS = 24 * 60 * 60 * 1000;

function pickRandomVerse() {
  const verse = meditationVerses[Math.floor(Math.random() * meditationVerses.length)];
  return {
    isCustom: false,
    textFr: verse.textFr,
    textEn: verse.textEn,
    referenceFr: verse.referenceFr,
    referenceEn: verse.referenceEn,
    customText: null,
    customReference: null,
  };
}

// Renvoie le verset du jour courant, en le renouvelant automatiquement (nouveau tirage
// aléatoire) si plus de 24h se sont écoulées depuis la dernière mise à jour — qu'elle soit
// automatique ou personnalisée par un admin.
async function getOrRefreshDailyVerse() {
  const existing = await prisma.dailyVerse.findUnique({ where: { id: DAILY_VERSE_ID } });
  const expired = !existing || Date.now() - existing.updatedAt.getTime() >= DAILY_VERSE_TTL_MS;
  if (!expired) return existing;
  return prisma.dailyVerse.upsert({
    where: { id: DAILY_VERSE_ID },
    update: pickRandomVerse(),
    create: { id: DAILY_VERSE_ID, ...pickRandomVerse() },
  });
}

router.get("/daily-verse", async (_req, res) => {
  const verse = await getOrRefreshDailyVerse();
  res.json(verse);
});

const dailyVerseSchema = z.object({
  customText: z.string().min(1),
  customReference: z.string().optional(),
});

router.put("/daily-verse", requireRole("ADMIN"), validateBody(dailyVerseSchema), async (req, res) => {
  const { customText, customReference } = req.body as z.infer<typeof dailyVerseSchema>;
  const verse = await prisma.dailyVerse.upsert({
    where: { id: DAILY_VERSE_ID },
    update: { isCustom: true, customText, customReference: customReference ?? null, textFr: null, textEn: null, referenceFr: null, referenceEn: null },
    create: { id: DAILY_VERSE_ID, isCustom: true, customText, customReference: customReference ?? null },
  });
  await logAction(req.user!.id, "DAILY_VERSE_UPDATE", "Personnalisation du verset du jour");
  res.json(verse);
});

router.delete("/daily-verse", requireRole("ADMIN"), async (req, res) => {
  const verse = await prisma.dailyVerse.upsert({
    where: { id: DAILY_VERSE_ID },
    update: pickRandomVerse(),
    create: { id: DAILY_VERSE_ID, ...pickRandomVerse() },
  });
  await logAction(req.user!.id, "DAILY_VERSE_RESET", "Retour au verset du jour automatique");
  res.json(verse);
});

router.get("/", async (req, res) => {
  const meditations = await prisma.meditation.findMany({
    orderBy: { createdAt: "desc" },
    include: req.user!.role === "ADMIN" ? { _count: { select: { views: true } } } : undefined,
  });
  res.json(meditations);
});

router.get("/:id", async (req, res) => {
  const meditation = await prisma.meditation.findUnique({ where: { id: req.params.id } });
  if (!meditation) return res.status(404).json({ message: "Méditation introuvable" });
  res.json(meditation);
});

const meditationSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  content: z.string().optional(),
  duration: z.number().int().positive().optional(),
});

router.post("/", requireRole("ADMIN"), validateBody(meditationSchema), async (req, res) => {
  const meditation = await prisma.meditation.create({ data: req.body as z.infer<typeof meditationSchema> });
  await logAction(req.user!.id, "MEDITATION_CREATE", `Création de la méditation ${meditation.title}`);
  res.status(201).json(meditation);
});

router.put("/:id", requireRole("ADMIN"), validateBody(meditationSchema.partial()), async (req, res) => {
  const meditation = await prisma.meditation.update({ where: { id: req.params.id }, data: req.body });
  await logAction(req.user!.id, "MEDITATION_UPDATE", `Modification de la méditation ${meditation.title}`);
  res.json(meditation);
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const meditation = await prisma.meditation.delete({ where: { id: req.params.id } });
  await logAction(req.user!.id, "MEDITATION_DELETE", `Suppression de la méditation ${meditation.title}`);
  res.status(204).send();
});

// Enregistre qu'un utilisateur a consulté une méditation
router.post("/:id/view", async (req, res) => {
  const meditation = await prisma.meditation.findUnique({ where: { id: req.params.id } });
  if (!meditation) return res.status(404).json({ message: "Méditation introuvable" });

  await prisma.meditationView.upsert({
    where: { meditationId_userId: { meditationId: req.params.id, userId: req.user!.id } },
    update: { viewedAt: new Date() },
    create: { meditationId: req.params.id, userId: req.user!.id },
  });
  res.status(204).send();
});

// Liste des utilisateurs ayant consulté une méditation (admin uniquement)
router.get("/:id/views", requireRole("ADMIN"), async (req, res) => {
  const views = await prisma.meditationView.findMany({
    where: { meditationId: req.params.id },
    orderBy: { viewedAt: "desc" },
    include: { user: { select: userSummarySelect } },
  });
  res.json(views);
});

export default router;
