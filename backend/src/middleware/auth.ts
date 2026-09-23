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

// Token léger pour les invités externes sans compte qui rejoignent UNE réunion précise via son
// lien (voir routes/meetings.ts `POST /:id/guest` et ws.ts). Distinct de TokenPayload : un
// invité n'a pas de ligne User, donc pas d'id/role/email valides à faire circuler ailleurs dans
// l'API — ce token n'est accepté que par le WebSocket de signalisation, pour cette réunion.
export interface GuestTokenPayload {
  guestId: string;
  name: string;
  meetingId: string;
  guest: true;
}

const GUEST_TOKEN_TTL = "6h";

export function signGuestToken(payload: Omit<GuestTokenPayload, "guest">): string {
  return jwt.sign({ ...payload, guest: true }, JWT_SECRET, { expiresIn: GUEST_TOKEN_TTL });
}

export function verifyGuestToken(token: string): GuestTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as GuestTokenPayload;
  if (!decoded.guest) throw new Error("Ce token n'est pas un token invité");
  return decoded;
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
