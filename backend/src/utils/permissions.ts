import { Role } from "@prisma/client";
import { prisma } from "../prisma";

// Règle commune à la messagerie et aux appels (1:1 et signalisation WebRTC) :
// un admin peut contacter/appeler n'importe qui, un utilisateur ne peut
// contacter/appeler qu'un administrateur.
export async function canContact(fromId: string, fromRole: Role, toId: string): Promise<boolean> {
  if (fromId === toId) return false;
  if (fromRole === "ADMIN") return true;
  const other = await prisma.user.findUnique({ where: { id: toId } });
  return other?.role === "ADMIN";
}
