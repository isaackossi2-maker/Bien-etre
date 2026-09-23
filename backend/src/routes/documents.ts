import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { logAction } from "../utils/log";

const router = Router();
router.use(authenticate);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "documents");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_SIZE = 60 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`),
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Le document doit être un fichier PDF"));
      return;
    }
    cb(null, true);
  },
});

const documentListSelect = {
  id: true,
  title: true,
  description: true,
  coverData: true,
  originalFileName: true,
  fileMimeType: true,
  fileSize: true,
  downloadEnabled: true,
  downloadStartAt: true,
  downloadEndAt: true,
  createdAt: true,
};

// Le téléchargement est autorisé seulement si l'admin l'a activé ET que la date courante est
// dans la fenêtre définie (une borne nulle = pas de restriction de ce côté-là).
function isDownloadAllowed(doc: { downloadEnabled: boolean; downloadStartAt: Date | null; downloadEndAt: Date | null }): boolean {
  if (!doc.downloadEnabled) return false;
  const now = new Date();
  if (doc.downloadStartAt && now < doc.downloadStartAt) return false;
  if (doc.downloadEndAt && now > doc.downloadEndAt) return false;
  return true;
}

router.get("/", async (_req, res) => {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: documentListSelect,
  });
  res.json(documents);
});

router.get("/:id/file", async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ message: "Document introuvable" });
  const filePath = path.join(UPLOAD_DIR, doc.fileFileName);
  res.setHeader("Content-Type", doc.fileMimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalFileName)}"`);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: "Fichier introuvable" });
  });
});

// Distinct de "/:id/file" (toujours en lecture seule, "inline") : celle-ci force le
// téléchargement ("attachment") et vérifie que l'admin l'a bien autorisé, dans la fenêtre
// de dates éventuellement définie.
router.get("/:id/download", async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ message: "Document introuvable" });
  if (!isDownloadAllowed(doc)) {
    return res.status(403).json({ message: "Le téléchargement de ce document n'est pas autorisé actuellement" });
  }
  const filePath = path.join(UPLOAD_DIR, doc.fileFileName);
  res.setHeader("Content-Type", doc.fileMimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.originalFileName)}"`);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: "Fichier introuvable" });
  });
});

// Les champs de téléchargement transitent en multipart (mêmes requêtes que le fichier/la
// couverture) donc en chaînes de caractères brutes : coercition explicite plutôt que des types
// natifs boolean/date dans le schéma.
const downloadFieldsSchema = z.object({
  downloadEnabled: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  downloadStartAt: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Date de début invalide" }),
  downloadEndAt: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Date de fin invalide" }),
});

const documentSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    coverData: z.string().min(1),
  })
  .merge(downloadFieldsSchema);

router.post(
  "/",
  requireRole("ADMIN"),
  upload.single("file"),
  validateBody(documentSchema),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Le fichier PDF est requis" });
    const { title, description, coverData, downloadEnabled, downloadStartAt, downloadEndAt } =
      req.body as z.infer<typeof documentSchema>;
    const doc = await prisma.document.create({
      data: {
        title,
        description,
        coverData,
        fileFileName: req.file.filename,
        originalFileName: req.file.originalname,
        fileMimeType: req.file.mimetype,
        fileSize: req.file.size,
        downloadEnabled: downloadEnabled ?? false,
        downloadStartAt: downloadStartAt ? new Date(downloadStartAt) : null,
        downloadEndAt: downloadEndAt ? new Date(downloadEndAt) : null,
      },
      select: documentListSelect,
    });
    await logAction(req.user!.id, "DOCUMENT_CREATE", `Ajout du document ${doc.title}`);
    res.status(201).json(doc);
  }
);

// Modification des seuls paramètres de téléchargement (pas de re-upload du fichier/de la
// couverture) : requête JSON classique, pas multipart, donc un schéma séparé avec de vrais
// booléens/chaînes plutôt que la coercition multipart de documentSchema.
const downloadSettingsSchema = z.object({
  downloadEnabled: z.boolean(),
  downloadStartAt: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Date de début invalide" }),
  downloadEndAt: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), { message: "Date de fin invalide" }),
});

router.put(
  "/:id/download-settings",
  requireRole("ADMIN"),
  validateBody(downloadSettingsSchema),
  async (req, res) => {
    const { downloadEnabled, downloadStartAt, downloadEndAt } = req.body as z.infer<typeof downloadSettingsSchema>;
    const doc = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        downloadEnabled,
        downloadStartAt: downloadStartAt ? new Date(downloadStartAt) : null,
        downloadEndAt: downloadEndAt ? new Date(downloadEndAt) : null,
      },
      select: documentListSelect,
    });
    await logAction(req.user!.id, "DOCUMENT_DOWNLOAD_SETTINGS", `Modification du téléchargement de ${doc.title}`);
    res.json(doc);
  }
);

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const doc = await prisma.document.delete({ where: { id: req.params.id } });
  await fs.promises.unlink(path.join(UPLOAD_DIR, doc.fileFileName)).catch(() => {});
  await logAction(req.user!.id, "DOCUMENT_DELETE", `Suppression du document ${doc.title}`);
  res.status(204).send();
});

export default router;
