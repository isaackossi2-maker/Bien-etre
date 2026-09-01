import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth";
import { translateBatch } from "../utils/translate";

const router = Router();
router.use(authenticate);

// translateBatch découpe déjà en petits groupes pour LibreTranslate ; cette limite ne sert
// qu'à borner la taille d'une requête HTTP, pas la capacité réelle de traduction.
const MAX_BATCH = 400;
// Les annonces/méditations peuvent être de vrais articles ; une limite trop basse
// rejetait silencieusement tout le lot dès qu'un seul texte la dépassait (un post
// de 5291 caractères a fait échouer la traduction de toute la page).
const MAX_LENGTH = 20000;

const bodySchema = z.object({
  texts: z.array(z.string().max(MAX_LENGTH)).max(MAX_BATCH),
  target: z.enum(["fr", "en"]),
});

router.post("/", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
  }
  const translations = await translateBatch(parsed.data.texts, parsed.data.target);
  res.json({ translations });
});

export default router;
