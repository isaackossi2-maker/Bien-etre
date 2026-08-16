import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Les comptes de démo ne sont créés qu'au tout premier démarrage (base vide) :
  // une suppression volontaire par la suite ne doit jamais être annulée par un
  // redémarrage/rebuild du backend.
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const adminPassword = await bcrypt.hash("Admin123!", 10);
    const userPassword = await bcrypt.hash("User123!", 10);

    const admin = await prisma.user.create({
      data: {
        email: "admin@example.com",
        password: adminPassword,
        name: "Administrateur",
        role: "ADMIN",
      },
    });

    await prisma.user.create({
      data: {
        email: "user@example.com",
        password: userPassword,
        name: "Utilisateur Demo",
        role: "USER",
      },
    });

    console.log("Comptes de démo créés. Compte admin:", admin.email, "/ mot de passe: Admin123!");
  }

  const meditationCount = await prisma.meditation.count();
  if (meditationCount === 0) {
    await prisma.meditation.createMany({
      data: [
        {
          title: "Respiration consciente",
          description: "Une courte séance pour se recentrer.",
          content: "Installez-vous confortablement et respirez profondément pendant 5 minutes.",
          duration: 5,
        },
        {
          title: "Scan corporel",
          description: "Relâchez les tensions du corps.",
          content: "Portez votre attention successivement sur chaque partie du corps.",
          duration: 10,
        },
      ],
    });
  }

  const examCount = await prisma.exam.count();
  if (examCount === 0) {
    const exam = await prisma.exam.create({
      data: {
        title: "Culture générale - Niveau 1",
        description: "Un premier examen de découverte.",
        questions: {
          create: [
            {
              text: "Quelle est la capitale de la France ?",
              order: 1,
              answers: {
                create: [
                  { text: "Paris", isCorrect: true },
                  { text: "Lyon", isCorrect: false },
                  { text: "Marseille", isCorrect: false },
                ],
              },
            },
            {
              text: "Combien font 2 + 2 ?",
              order: 2,
              answers: {
                create: [
                  { text: "3", isCorrect: false },
                  { text: "4", isCorrect: true },
                  { text: "5", isCorrect: false },
                ],
              },
            },
          ],
        },
      },
    });
    console.log(`Examen créé: ${exam.title}`);
  }

  console.log("Seed terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
