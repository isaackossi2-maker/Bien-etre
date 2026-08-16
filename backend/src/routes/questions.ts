import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { logAction } from "../utils/log";

const router = Router();
router.use(authenticate);

// Liste des questions (banque de questions), avec leurs réponses. Filtrable par examen.
router.get("/", async (req, res) => {
  const examId = typeof req.query.examId === "string" ? req.query.examId : undefined;
  const questions = await prisma.question.findMany({
    where: examId ? { examId } : undefined,
    orderBy: [{ examId: "asc" }, { order: "asc" }],
    include: {
      answers: true,
      exam: { select: { id: true, title: true } },
    },
  });

  if (req.user!.role !== "ADMIN") {
    questions.forEach((q) => q.answers.forEach((a) => ((a as { isCorrect: boolean }).isCorrect = false)));
  }
  res.json(questions);
});

const answerInput = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean().default(false),
});

const questionTypeSchema = z.enum(["SINGLE", "MULTIPLE"]);

function validateAnswerShape(type: "SINGLE" | "MULTIPLE", answers: { isCorrect: boolean }[]) {
  const correctCount = answers.filter((a) => a.isCorrect).length;
  if (type === "SINGLE" && correctCount !== 1) {
    return "Une question à choix unique doit avoir exactement une bonne réponse";
  }
  if (type === "MULTIPLE" && correctCount < 1) {
    return "Une question à choix multiples doit avoir au moins une bonne réponse";
  }
  return null;
}

const questionSchema = z.object({
  examId: z.string().min(1),
  text: z.string().min(1),
  type: questionTypeSchema.default("SINGLE"),
  order: z.number().int().default(0),
  answers: z.array(answerInput).min(2),
});

router.post("/", requireRole("ADMIN"), async (req, res) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }
  const { examId, text, type, order, answers } = parsed.data;

  const shapeError = validateAnswerShape(type, answers);
  if (shapeError) return res.status(400).json({ message: shapeError });

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return res.status(404).json({ message: "Examen introuvable" });

  const question = await prisma.question.create({
    data: { examId, text, type, order, answers: { create: answers } },
    include: { answers: true },
  });
  await logAction(req.user!.id, "QUESTION_CREATE", `Création d'une question pour l'examen ${exam.title}`);
  res.status(201).json(question);
});

const updateSchema = z.object({
  text: z.string().min(1).optional(),
  type: questionTypeSchema.optional(),
  order: z.number().int().optional(),
  answers: z.array(answerInput).min(2).optional(),
});

router.put("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }
  const { answers, type, ...rest } = parsed.data;

  if (answers) {
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Question introuvable" });
    const effectiveType = type ?? existing.type;
    const shapeError = validateAnswerShape(effectiveType, answers);
    if (shapeError) return res.status(400).json({ message: shapeError });
  }

  const question = await prisma.$transaction(async (tx) => {
    if (answers) {
      await tx.answer.deleteMany({ where: { questionId: req.params.id } });
    }
    return tx.question.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(type ? { type } : {}),
        ...(answers ? { answers: { create: answers } } : {}),
      },
      include: { answers: true },
    });
  });

  await logAction(req.user!.id, "QUESTION_UPDATE", `Modification d'une question`);
  res.json(question);
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.question.delete({ where: { id: req.params.id } });
  await logAction(req.user!.id, "QUESTION_DELETE", `Suppression d'une question`);
  res.status(204).send();
});

export default router;
