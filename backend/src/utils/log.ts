import { prisma } from "../prisma";

export async function logAction(userId: string | null, action: string, message?: string) {
  await prisma.log.create({
    data: { userId: userId ?? undefined, action, message },
  });
}
