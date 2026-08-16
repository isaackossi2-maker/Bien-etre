# Application Bien-être

Application React (Vite + TypeScript) avec un espace **Admin** et un espace **Utilisateur**, un backend Node/Express + Prisma, et une base PostgreSQL. Le tout tourne dans Docker.

## Structure

```
.
├── backend/     API Express + Prisma (PostgreSQL)
├── frontend/    React + Vite + TypeScript, servi par nginx
└── docker-compose.yml
```

## Fonctionnalités

**Espace Admin** (`/admin`) :
- Tableau de bord (statistiques, activité récente, publication d'annonces avec réactions/commentaires)
- Utilisateurs (créer un admin ou un utilisateur, changer le rôle d'un utilisateur existant, supprimer)
- Examens (créer/modifier, rendre accessible ou inaccessible, définir une durée et un nombre max. de tentatives)
- Méditations (créer, lister, supprimer, voir qui a consulté chaque méditation)
- Correction des examens (voir les réponses de chaque utilisateur, ajuster un score)
- Messages (choisir n'importe quel utilisateur et discuter avec lui)
- Logs (journal des actions: connexions, créations, suppressions...)

**Espace Utilisateur** (`/app`) :
- Tableau de bord (annonces publiées par l'admin : réagir, commenter)
- Méditations (consultation — la consultation est enregistrée pour l'admin)
- Examens (liste avec compteur de tentatives, passage d'un examen avec minuteur si une durée est définie, historique des scores)
- Questions & Réponses (discussion avec l'équipe d'administration)

L'inscription en autonomie (nom complet, email, mot de passe) est disponible sur `/register`, avec le rôle Utilisateur par défaut.

## Démarrer avec Docker

```bash
docker compose up --build
```

- Frontend : http://localhost:5173
- Backend (API) : http://localhost:4001/api
- PostgreSQL : localhost:5433 (user/password: `app` / `app`, base `appdb`)

> Ports hôte choisis pour éviter les conflits avec d'autres projets déjà lancés sur cette machine (5432/4000 étaient occupés). Ajuste-les dans `docker-compose.yml` si besoin — la communication interne entre conteneurs (frontend → backend → db) reste inchangée.

Au premier démarrage, le backend applique le schéma de base de données et insère des données de démonstration.

### Comptes de démonstration

| Rôle          | Email               | Mot de passe |
|---------------|----------------------|--------------|
| Administrateur | admin@example.com   | Admin123!    |
| Utilisateur    | user@example.com    | User123!     |

## Développement local (sans Docker)

Backend :
```bash
cd backend
npm install
# nécessite un PostgreSQL local, voir DATABASE_URL dans docker-compose.yml
npx prisma db push
npm run seed
npm run dev
```

Frontend :
```bash
cd frontend
npm install
npm run dev
```

Le serveur de dev Vite proxifie automatiquement `/api` vers `http://localhost:4000`.

## Notes techniques

- Authentification par JWT (7 jours), rôle stocké dans le token (`ADMIN` / `USER`).
- Les routes `/admin/*` et l'API admin sont protégées côté frontend (routes) et backend (middleware `requireRole`).
- Le schéma de base est appliqué avec `prisma db push` au démarrage du conteneur backend (pratique pour ce scaffold ; pour un usage en production, il est recommandé de passer à de vraies migrations Prisma versionnées : `prisma migrate dev` / `prisma migrate deploy`).
- Pensez à changer `JWT_SECRET` et les identifiants PostgreSQL dans `docker-compose.yml` avant tout déploiement réel.
