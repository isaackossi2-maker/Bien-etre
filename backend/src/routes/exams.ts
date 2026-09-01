import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logAction } from "../utils/log";

const router = Router();
router.use(authenticate);

// Liste des examens : l'admin voit tout, l'utilisateur ne voit que les examens accessibles
router.get("/", async (req, res) => {
  const where = req.user!.role === "ADMIN" ? {} : { isActive: true };
  const exams = await prisma.exam.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });

  if (req.user!.role === "ADMIN") {
    return res.json(exams);
  }

  const attemptCounts = await prisma.examResult.groupBy({
    by: ["examId"],
    where: { userId: req.user!.id },
    _count: { _all: true },
  });
  const attemptsMap = new Map(attemptCounts.map((a) => [a.examId, a._count._all]));

  res.json(exams.map((exam) => ({ ...exam, attemptsUsed: attemptsMap.get(exam.id) ?? 0 })));
});

// Détail d'un examen avec ses questions/réponses
router.get("/:id", async (req, res) => {
  const exam = await prisma.exam.findUnique({
    where: { id: req.params.id },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: { answers: true },
      },
    },
  });
  if (!exam) return res.status(404).json({ message: "Examen introuvable" });

  if (req.user!.role !== "ADMIN") {
    if (!exam.isActive) {
      return res.status(403).json({ message: "Cet examen n'est pas accessible" });
    }
    // Un utilisateur non-admin ne doit pas voir quelle réponse est correcte avant de soumettre
    exam.questions.forEach((q) => {
      q.answers.forEach((a) => {
        (a as { isCorrect: boolean }).isCorrect = false;
      });
    });
    const attemptsUsed = await prisma.examResult.count({ where: { examId: exam.id, userId: req.user!.id } });
    return res.json({ ...exam, attemptsUsed });
  }
  res.json(exam);
});

const examCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  duration: z.number().int().positive().optional(),
  maxAttempts: z.number().int().positive().optional(),
});

const examUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  duration: z.number().int().positive().nullable().optional(),
  maxAttempts: z.number().int().positive().nullable().optional(),
});

router.post("/", requireRole("ADMIN"), validateBody(examCreateSchema), async (req, res) => {
  const exam = await prisma.exam.create({ data: req.body as z.infer<typeof examCreateSchema> });
  await logAction(req.user!.id, "EXAM_CREATE", `Création de l'examen ${exam.title}`);
  res.status(201).json(exam);
});

router.put("/:id", requireRole("ADMIN"), validateBody(examUpdateSchema), async (req, res) => {
  const exam = await prisma.exam.update({ where: { id: req.params.id }, data: req.body as z.infer<typeof examUpdateSchema> });
  await logAction(req.user!.id, "EXAM_UPDATE", `Modification de l'examen ${exam.title}`);
  res.json(exam);
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const exam = await prisma.exam.delete({ where: { id: req.params.id } });
  await logAction(req.user!.id, "EXAM_DELETE", `Suppression de l'examen ${exam.title}`);
  res.status(204).send();
});

// Soumission des réponses par un utilisateur
const submitSchema = z.object({
  answers: z.array(z.object({ questionId: z.string(), answerIds: z.array(z.string()).min(1) })),
});

router.post("/:id/submit", validateBody(submitSchema), async (req, res) => {
  const parsedData = req.body as z.infer<typeof submitSchema>;

  const exam = await prisma.exam.findUnique({
    where: { id: req.params.id },
    include: { questions: { include: { answers: true } } },
  });
  if (!exam) return res.status(404).json({ message: "Examen introuvable" });
  if (req.user!.role !== "ADMIN") {
    if (!exam.isActive) {
      return res.status(403).json({ message: "Cet examen n'est pas accessible" });
    }
    if (exam.maxAttempts !== null) {
      const attemptsUsed = await prisma.examResult.count({ where: { examId: exam.id, userId: req.user!.id } });
      if (attemptsUsed >= exam.maxAttempts) {
        return res.status(403).json({ message: "Nombre maximum de tentatives atteint pour cet examen" });
      }
    }
  }

  let score = 0;
  const total = exam.questions.length;
  const validAnswers: { questionId: string; answerId: string }[] = [];

  for (const submitted of parsedData.answers) {
    const question = exam.questions.find((q) => q.id === submitted.questionId);
    if (!question) continue;

    const validAnswerIds = submitted.answerIds.filter((id) => question.answers.some((a) => a.id === id));
    if (validAnswerIds.length === 0) continue;

    for (const answerId of validAnswerIds) {
      validAnswers.push({ questionId: question.id, answerId });
    }

    const correctIds = question.answers.filter((a) => a.isCorrect).map((a) => a.id).sort();
    const selectedIds = [...new Set(validAnswerIds)].sort();
    const isFullyCorrect =
      correctIds.length === selectedIds.length && correctIds.every((id, i) => id === selectedIds[i]);
    if (isFullyCorrect) score += 1;
  }

  const result = await prisma.examResult.create({
    data: {
      userId: req.user!.id,
      examId: exam.id,
      score,
      total,
      userAnswers: { create: validAnswers },
    },
  });

  await logAction(req.user!.id, "EXAM_SUBMIT", `Soumission de l'examen ${exam.title} (${score}/${total})`);
  res.status(201).json({ id: result.id, score, total });
});

// Résultats: l'utilisateur voit les siens, l'admin voit tout
router.get("/results/all", async (req, res) => {
  const where = req.user!.role === "ADMIN" ? {} : { userId: req.user!.id };
  const results = await prisma.examResult.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      exam: { select: { title: true } },
      user: { select: { name: true, email: true } },
      userAnswers: {
        include: {
          question: { select: { text: true } },
          answer: { select: { text: true, isCorrect: true } },
        },
      },
    },
  });
  res.json(results);
});

// Détail d'une soumission (corrigé) : questions, réponses de l'utilisateur, état de correction actuel.
// Accessible à l'admin pour corriger, et à l'utilisateur concerné pour consulter son propre corrigé.
router.get("/results/:id/detail", async (req, res) => {
  const result = await prisma.examResult.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      exam: {
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { answers: true },
          },
        },
      },
      userAnswers: true,
      questionGrades: true,
    },
  });
  if (!result) return res.status(404).json({ message: "Résultat introuvable" });
  if (req.user!.role !== "ADMIN" && result.userId !== req.user!.id) {
    return res.status(403).json({ message: "Accès refusé" });
  }

  const questions = result.exam.questions.map((q) => {
    const selectedIds = result.userAnswers.filter((ua) => ua.questionId === q.id).map((ua) => ua.answerId);
    const correctIds = q.answers.filter((a) => a.isCorrect).map((a) => a.id).sort();
    const sortedSelected = [...new Set(selectedIds)].sort();
    const autoCorrect =
      correctIds.length === sortedSelected.length && correctIds.every((id, i) => id === sortedSelected[i]);
    const grade = result.questionGrades.find((g) => g.questionId === q.id);

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      answers: q.answers.map((a) => ({
        id: a.id,
        text: a.text,
        isCorrect: a.isCorrect,
        selected: selectedIds.includes(a.id),
      })),
      isCorrect: grade ? grade.isCorrect : autoCorrect,
    };
  });

  res.json({
    id: result.id,
    score: result.score,
    total: result.total,
    comment: result.comment,
    createdAt: result.createdAt,
    exam: { id: result.exam.id, title: result.exam.title },
    user: result.user,
    questions,
  });
});

// Enregistrement de la correction : boutons vert/rouge par question + barème et note décidés par
// l'admin (indépendants du nombre de questions) + commentaire
const gradeSchema = z
  .object({
    score: z.number().int().min(0),
    total: z.number().int().positive(),
    comment: z.string().optional(),
    questionGrades: z.array(z.object({ questionId: z.string(), isCorrect: z.boolean() })).min(1),
  })
  .refine((data) => data.score <= data.total, {
    message: "La note ne peut pas dépasser le barème",
    path: ["score"],
  });

router.put("/results/:id/grade", requireRole("ADMIN"), async (req, res) => {
  const parsed = gradeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Données invalides", errors: parsed.error.flatten() });
  }

  const existing = await prisma.examResult.findUnique({
    where: { id: req.params.id },
    include: { exam: { select: { title: true, questions: { select: { id: true } } } } },
  });
  if (!existing) return res.status(404).json({ message: "Résultat introuvable" });

  // Sans ce contrôle, un questionId copié-collé d'un autre examen serait accepté par Prisma
  // (la contrainte de clé étrangère ne vérifie que l'existence de la question, pas son
  // appartenance à CET examen) et attacherait une note invisible à ce résultat.
  const validQuestionIds = new Set(existing.exam.questions.map((q) => q.id));
  const hasForeignQuestion = parsed.data.questionGrades.some((g) => !validQuestionIds.has(g.questionId));
  if (hasForeignQuestion) {
    return res.status(400).json({ message: "Une des questions ne correspond pas à cet examen" });
  }

  const { score, total } = parsed.data;

  await prisma.$transaction([
    ...parsed.data.questionGrades.map((g) =>
      prisma.questionGrade.upsert({
        where: { examResultId_questionId: { examResultId: req.params.id, questionId: g.questionId } },
        create: { examResultId: req.params.id, questionId: g.questionId, isCorrect: g.isCorrect },
        update: { isCorrect: g.isCorrect },
      })
    ),
    prisma.examResult.update({
      where: { id: req.params.id },
      data: { score, total, comment: parsed.data.comment },
    }),
  ]);

  const notifContent = `Votre examen "${existing.exam.title}" a été corrigé : ${score}/${total}.${
    parsed.data.comment ? ` Commentaire : ${parsed.data.comment}` : ""
  }`;

  // Une seule notification par soumission : on met à jour le message existant plutôt que d'en
  // créer un nouveau à chaque re-correction, pour éviter de spammer l'utilisateur.
  if (existing.notificationMessageId) {
    await prisma.message.update({
      where: { id: existing.notificationMessageId },
      data: { content: notifContent, readAt: null, createdAt: new Date(), senderId: req.user!.id },
    });
  } else {
    const notification = await prisma.message.create({
      data: { senderId: req.user!.id, recipientId: existing.userId, content: notifContent },
    });
    await prisma.examResult.update({
      where: { id: req.params.id },
      data: { notificationMessageId: notification.id },
    });
  }

  await logAction(
    req.user!.id,
    "EXAM_RESULT_CORRECT",
    `Correction du résultat ${req.params.id} -> ${score}/${total}`
  );
  res.json({ score, total });
});

export default router;
