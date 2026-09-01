import { Router } from "express";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/", async (req, res) => {
  // "|| 200" écraserait un ?limit=0 explicite (0 est falsy) : on ne retombe sur le
  // défaut que si la valeur est absente ou invalide, pas simplement fausse-y.
  const rawLimit = Number(req.query.limit);
  const limit = Math.min(req.query.limit !== undefined && Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : 200, 500);
  const logs = await prisma.log.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true, avatar: true } } },
  });
  res.json(logs);
});

export default router;
