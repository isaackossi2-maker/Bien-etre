#!/bin/sh
set -e

# Une nouvelle clé est générée à chaque démarrage du conteneur : tous les
# tokens JWT émis précédemment deviennent invalides et les utilisateurs
# doivent se reconnecter après chaque rebuild/redémarrage du backend.
export JWT_SECRET="$(openssl rand -hex 32)"

echo "Applying database schema..."
npx prisma db push --skip-generate --accept-data-loss

echo "Seeding database..."
npx tsx prisma/seed.ts

echo "Starting server..."
exec node dist/server.js
