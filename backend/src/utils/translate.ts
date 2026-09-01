import crypto from "crypto";
import { prisma } from "../prisma";

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || "http://localhost:5000";
// LibreTranslate est appelé par petits groupes plutôt qu'en un seul lot géant : un examen à
// beaucoup de questions/réponses dépassait auparavant la limite de l'API et faisait échouer
// la traduction de TOUT le lot (y compris les textes qui n'avaient rien d'anormal).
const LIBRETRANSLATE_CHUNK_SIZE = 40;

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Traduit une liste de textes vers la langue cible, en s'appuyant sur un cache
// persistant (TranslationCache) pour ne jamais retraduire deux fois le même texte.
// Si LibreTranslate est indisponible, retombe silencieusement sur le texte original.
export async function translateBatch(texts: string[], target: "fr" | "en"): Promise<string[]> {
  const entries = texts.map((text) => ({ text, hash: hashText(text) }));
  const hashes = [...new Set(entries.map((e) => e.hash))];

  const cached = await prisma.translationCache.findMany({
    where: { targetLang: target, sourceHash: { in: hashes } },
  });
  const cacheMap = new Map(cached.map((c) => [c.sourceHash, c.translatedText]));

  const missing = entries.filter((e) => e.text.trim() && !cacheMap.has(e.hash));
  const uniqueMissing = [...new Map(missing.map((m) => [m.hash, m])).values()];

  for (const group of chunk(uniqueMissing, LIBRETRANSLATE_CHUNK_SIZE)) {
    try {
      const res = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: group.map((m) => m.text),
          source: "auto",
          target,
          format: "text",
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { translatedText: string[] };
        await Promise.all(
          group.map((m, i) => {
            const translated = data.translatedText[i] ?? m.text;
            cacheMap.set(m.hash, translated);
            return prisma.translationCache
              .upsert({
                where: { sourceHash_targetLang: { sourceHash: m.hash, targetLang: target } },
                update: { translatedText: translated },
                create: { sourceHash: m.hash, targetLang: target, translatedText: translated },
              })
              .catch(() => {});
          })
        );
      }
    } catch {
      // LibreTranslate injoignable pour ce groupe : on retombe sur le texte original pour ces
      // entrées, sans empêcher les autres groupes du même lot d'être traduits.
    }
  }

  return entries.map((e) => cacheMap.get(e.hash) ?? e.text);
}
