import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logAction } from "../utils/log";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

router.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, role: true, avatar: true, createdAt: true },
  });
  res.json(users);
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
});

router.post("/", validateBody(createSchema), async (req, res) => {
  const { email, password, name, role } = req.body as z.infer<typeof createSchema>;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: "Un compte existe déjà avec cet email" });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, name, role },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  await logAction(req.user!.id, "USER_CREATE", `Création de l'utilisateur ${user.email}`);
  res.status(201).json(user);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  password: z.string().min(6).optional(),
});

router.put("/:id", validateBody(updateSchema), async (req, res) => {
  const parsedData = req.body as z.infer<typeof updateSchema>;

  // Un admin qui se rétrograde lui-même via cette table (au lieu de sa page profil) pourrait
  // se retrouver instantanément sans accès admin en pleine session, sans aucun avertissement.
  if (req.params.id === req.user!.id && parsedData.role && parsedData.role !== "ADMIN") {
    return res.status(400).json({ message: "Vous ne pouvez pas modifier votre propre rôle" });
  }

  const data: Record<string, unknown> = { ...parsedData };
  if (parsedData.password) {
    data.password = await bcrypt.hash(parsedData.password, 10);
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  await logAction(req.user!.id, "USER_UPDATE", `Modification de l'utilisateur ${user.email}`);
  res.json(user);
});

router.delete("/:id", async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte" });
  }
  const user = await prisma.user.delete({ where: { id: req.params.id } });
  await logAction(req.user!.id, "USER_DELETE", `Suppression de l'utilisateur ${user.email}`);
  res.status(204).send();
});

export default router;
