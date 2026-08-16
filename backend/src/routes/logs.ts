import { Router } from "express";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const logs = await prisma.log.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true, avatar: true } } },
  });
  res.json(logs);
});

export default router;
