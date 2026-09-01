// Projections Prisma réutilisées telles quelles à plusieurs endroits, pour éviter
// que chaque route déclare sa propre variante et diverge au fil du temps.
export const userSummarySelect = { id: true, name: true, email: true } as const;
