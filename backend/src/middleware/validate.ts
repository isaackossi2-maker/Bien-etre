import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

// Valide req.body contre le schéma fourni et répond 400 en cas d'erreur, pour
// éviter de répéter le même bloc "safeParse + return 400" dans chaque route.
// La donnée validée remplace req.body, typée via `req.body as z.infer<typeof schema>`
// au point d'usage.
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
    }
    req.body = parsed.data;
    next();
  };
}
