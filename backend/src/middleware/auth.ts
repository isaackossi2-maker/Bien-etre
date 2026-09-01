import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

// En production (via docker-entrypoint.sh) JWT_SECRET est toujours généré aléatoirement au
// démarrage ; ce repli ne sert qu'au développement local (`npm run dev`, hors Docker). On le
// signale bruyamment plutôt que de le laisser silencieux, pour ne jamais le rater ailleurs.
if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET non défini : utilisation d'une clé de développement non sécurisée.");
}
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

export interface TokenPayload {
  id: string;
  email: string;
  role: Role;
  name: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentification requise" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Token invalide ou expiré" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Accès refusé" });
    }
    next();
  };
}
