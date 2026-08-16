import { Router } from "express";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/stats", async (_req, res) => {
  const [users, exams, meditations, questions, examResults, recentLogs] = await Promise.all([
    prisma.user.count(),
    prisma.exam.count(),
    prisma.meditation.count(),
    prisma.question.count(),
    prisma.examResult.count(),
    prisma.log.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  res.json({
    counts: { users, exams, meditations, questions, examResults },
    recentLogs,
  });
});

export default router;
