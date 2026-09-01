import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logAction } from "../utils/log";

const router = Router();
router.use(authenticate);

// Liste des questions (banque de questions), avec leurs réponses. Filtrable par examen.
// Un non-admin ne doit voir que les questions d'examens publiés (même règle que GET /exams/:id),
// sans quoi le contenu d'un examen encore en brouillon fuiterait avant sa mise en accessible.
router.get("/", async (req, res) => {
  const examId = typeof req.query.examId === "string" ? req.query.examId : undefined;
  const isAdmin = req.user!.role === "ADMIN";
  const questions = await prisma.question.findMany({
    where: {
      ...(examId ? { examId } : {}),
      ...(isAdmin ? {} : { exam: { isActive: true } }),
    },
    orderBy: [{ examId: "asc" }, { order: "asc" }],
    include: {
      answers: true,
      exam: { select: { id: true, title: true } },
    },
  });

  if (!isAdmin) {
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

router.post("/", requireRole("ADMIN"), validateBody(questionSchema), async (req, res) => {
  const { examId, text, type, order, answers } = req.body as z.infer<typeof questionSchema>;

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

router.put("/:id", requireRole("ADMIN"), validateBody(updateSchema), async (req, res) => {
  const { answers, type, ...rest } = req.body as z.infer<typeof updateSchema>;

  // La forme (nombre de bonnes réponses) doit être revalidée dès que le type OU les réponses
  // changent : changer seulement le type sans toucher aux réponses pouvait auparavant laisser
  // une question SINGLE avec plusieurs bonnes réponses (ou l'inverse), cassant la correction.
  if (answers || type) {
    const existing = await prisma.question.findUnique({ where: { id: req.params.id }, include: { answers: true } });
    if (!existing) return res.status(404).json({ message: "Question introuvable" });
    const effectiveType = type ?? existing.type;
    const effectiveAnswers = answers ?? existing.answers;
    const shapeError = validateAnswerShape(effectiveType, effectiveAnswers);
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
