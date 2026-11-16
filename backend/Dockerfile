FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

COPY docker-entrypoint.sh ./
# Normalise les fins de ligne : si ce fichier est cloné sur une machine avec core.autocrlf=true
# (courant sous Windows), Git le récupère en CRLF, ce qui casse le shebang ("#!/bin/sh\r" n'est
# pas reconnu par le noyau, erreur "not found" au démarrage du conteneur). Pas de risque pour un
# fichier déjà en LF : la commande ne trouve alors simplement rien à remplacer.
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

EXPOSE 4000

CMD ["./docker-entrypoint.sh"]
