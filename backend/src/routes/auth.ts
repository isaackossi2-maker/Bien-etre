import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate, signToken } from "../middleware/auth";
import { logAction } from "../utils/log";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: "Un compte existe déjà avec cet email" });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, name, role: "USER" },
  });

  const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  await logAction(user.id, "REGISTER", `Inscription de ${user.email}`);
  res
    .status(201)
    .json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar } });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides" });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ message: "Identifiants incorrects" });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ message: "Identifiants incorrects" });
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  await logAction(user.id, "LOGIN", `Connexion de ${user.email}`);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar } });
});

router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
  res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar },
  });
});

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  currentPassword: z.string().optional(),
  avatar: z.string().nullable().optional(),
});

router.put("/me", authenticate, async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }
  const { name, email, password, currentPassword, avatar } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });

  // Le mot de passe actuel est exigé pour modifier l'email ou le mot de passe (pas pour le nom seul).
  const changingSensitiveField = (!!email && email !== user.email) || !!password;
  if (changingSensitiveField) {
    if (!currentPassword) {
      return res.status(400).json({ message: "Mot de passe actuel requis pour modifier l'email ou le mot de passe" });
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Mot de passe actuel incorrect" });
    }
  }

  if (email && email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "Un compte existe déjà avec cet email" });
    }
  }

  const data: { name?: string; email?: string; password?: string; avatar?: string | null } = {};
  if (name) data.name = name;
  if (email) data.email = email;
  if (password) data.password = await bcrypt.hash(password, 10);
  if (avatar !== undefined) data.avatar = avatar;

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  const token = signToken({ id: updated.id, email: updated.email, role: updated.role, name: updated.name });
  await logAction(updated.id, "PROFILE_UPDATE", "Mise à jour du profil");
  res.json({
    token,
    user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, avatar: updated.avatar },
  });
});

export default router;
