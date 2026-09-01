import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logAction } from "../utils/log";

const router = Router();
router.use(authenticate);

// Un post est visible par tout le monde s'il n'a aucun destinataire précis (public),
// sinon uniquement par ses destinataires, son auteur, et les admins (pour la gestion).
function visibilityWhere(userId: string, role: string) {
  if (role === "ADMIN") return {};
  return {
    OR: [{ recipients: { none: {} } }, { recipients: { some: { userId } } }, { authorId: userId }],
  };
}

// Même règle de visibilité que la liste, appliquée à un post précis : sert à empêcher
// un utilisateur non destinataire de réagir/commenter un post qui lui est masqué.
async function loadAccessiblePost(postId: string, userId: string, role: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { recipients: { select: { userId: true } } },
  });
  if (!post) return { post: null, allowed: false };
  const allowed = role === "ADMIN" || post.authorId === userId || post.recipients.length === 0 || post.recipients.some((r) => r.userId === userId);
  return { post, allowed };
}

router.get("/", async (req, res) => {
  const posts = await prisma.post.findMany({
    where: visibilityWhere(req.user!.id, req.user!.role),
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, role: true, avatar: true } },
      reactions: { select: { userId: true, emoji: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
      },
      recipients: { include: { user: { select: { id: true, name: true, avatar: true } } } },
    },
  });

  const shaped = posts.map((p) => {
    const reactionSummary: Record<string, number> = {};
    let myReaction: string | null = null;
    for (const r of p.reactions) {
      reactionSummary[r.emoji] = (reactionSummary[r.emoji] ?? 0) + 1;
      if (r.userId === req.user!.id) myReaction = r.emoji;
    }
    return {
      id: p.id,
      content: p.content,
      background: p.background,
      createdAt: p.createdAt,
      author: p.author,
      reactionSummary,
      reactionCount: p.reactions.length,
      myReaction,
      comments: p.comments,
      recipients: p.recipients.map((r) => r.user),
    };
  });

  res.json(shaped);
});

const postSchema = z.object({
  content: z.string().min(1),
  background: z.string().optional(),
  recipientIds: z.array(z.string()).optional(),
});

router.post("/", requireRole("ADMIN"), validateBody(postSchema), async (req, res) => {
  const { content, background, recipientIds } = req.body as z.infer<typeof postSchema>;

  const post = await prisma.post.create({
    data: {
      content,
      background,
      authorId: req.user!.id,
      recipients:
        recipientIds && recipientIds.length > 0
          ? { create: recipientIds.map((userId) => ({ userId })) }
          : undefined,
    },
    include: {
      author: { select: { id: true, name: true, role: true, avatar: true } },
      recipients: { include: { user: { select: { id: true, name: true, avatar: true } } } },
    },
  });

  await logAction(
    req.user!.id,
    "POST_CREATE",
    recipientIds && recipientIds.length > 0
      ? `Publication ciblée envoyée à ${recipientIds.length} utilisateur(s)`
      : "Publication d'une annonce sur le tableau de bord"
  );
  res.status(201).json({
    ...post,
    reactionSummary: {},
    reactionCount: 0,
    myReaction: null,
    comments: [],
    recipients: post.recipients.map((r) => r.user),
  });
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.post.delete({ where: { id: req.params.id } });
  await logAction(req.user!.id, "POST_DELETE", "Suppression d'une annonce");
  res.status(204).send();
});

const reactSchema = z.object({ emoji: z.string().min(1).max(8) });

router.post("/:id/react", validateBody(reactSchema), async (req, res) => {
  const { emoji } = req.body as z.infer<typeof reactSchema>;

  const { post, allowed } = await loadAccessiblePost(req.params.id, req.user!.id, req.user!.role);
  if (!post) return res.status(404).json({ message: "Publication introuvable" });
  if (!allowed) return res.status(403).json({ message: "Accès refusé" });

  const existing = await prisma.postReaction.findUnique({
    where: { postId_userId: { postId: req.params.id, userId: req.user!.id } },
  });

  if (existing && existing.emoji === emoji) {
    await prisma.postReaction.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.postReaction.update({ where: { id: existing.id }, data: { emoji } });
  } else {
    await prisma.postReaction.create({ data: { postId: req.params.id, userId: req.user!.id, emoji } });
  }

  const reactions = await prisma.postReaction.findMany({ where: { postId: req.params.id } });
  const reactionSummary: Record<string, number> = {};
  for (const r of reactions) reactionSummary[r.emoji] = (reactionSummary[r.emoji] ?? 0) + 1;
  const myReaction = reactions.find((r) => r.userId === req.user!.id)?.emoji ?? null;

  res.json({ reactionSummary, reactionCount: reactions.length, myReaction });
});

const commentSchema = z.object({ content: z.string().min(1) });

router.post("/:id/comments", validateBody(commentSchema), async (req, res) => {
  const { post, allowed } = await loadAccessiblePost(req.params.id, req.user!.id, req.user!.role);
  if (!post) return res.status(404).json({ message: "Publication introuvable" });
  if (!allowed) return res.status(403).json({ message: "Accès refusé" });

  const comment = await prisma.postComment.create({
    data: { postId: req.params.id, userId: req.user!.id, content: (req.body as z.infer<typeof commentSchema>).content },
    include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
  });
  res.status(201).json(comment);
});

export default router;
