import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

// Cache mémoire partagé entre tous les composants de la session : évite de
// retraduire un texte déjà vu, même en changeant de page. Le backend a lui
// aussi un cache persistant (TranslationCache), donc même un texte jamais vu
// en mémoire mais déjà traduit une fois par quelqu'un d'autre revient vite.
const memoryCache = new Map<string, string>();
const pending = new Map<string, Promise<void>>();

function cacheKey(text: string, lang: string) {
  return `${lang}${text}`;
}

async function fetchTranslations(texts: string[], target: "fr" | "en") {
  try {
    const { data } = await api.post<{ translations: string[] }>("/translate", { texts, target });
    texts.forEach((text, i) => memoryCache.set(cacheKey(text, target), data.translations[i] ?? text));
  } catch (err) {
    // Échec réseau ou de traduction : on log pour le débogage, mais on ne bloque pas
    // l'affichage — les composants retombent sur le texte original (non traduit).
    console.error("Échec de la traduction du contenu :", err);
  }
}

/**
 * Traduit une liste de textes (titres, descriptions, contenus...) vers la
 * langue actuellement sélectionnée dans l'appli. Le contenu de l'application
 * est toujours saisi en français à l'origine : quand la langue active est
 * "fr", les textes sont retournés tels quels (aucun appel réseau).
 */
export function useTranslatedTexts(texts: Array<string | null | undefined>): string[] {
  const { i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "fr";
  const [, bump] = useState(0);
  const key = texts.filter((t): t is string => !!t).join("");

  useEffect(() => {
    if (lang === "fr") return;
    const toFetch = [...new Set(texts.filter((t): t is string => !!t && t.trim().length > 0))].filter(
      (t) => !memoryCache.has(cacheKey(t, lang))
    );
    if (toFetch.length === 0) return;

    let cancelled = false;
    const dedupeKey = `${lang}::${toFetch.slice().sort().join("")}`;
    let promise = pending.get(dedupeKey);
    if (!promise) {
      promise = fetchTranslations(toFetch, lang).finally(() => pending.delete(dedupeKey));
      pending.set(dedupeKey, promise);
    }
    promise.then(() => {
      if (!cancelled) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang]);

  if (lang === "fr") return texts.map((t) => t ?? "");
  return texts.map((t) => (t ? memoryCache.get(cacheKey(t, lang)) ?? t : ""));
}

export function useTranslatedText(text?: string | null): string {
  return useTranslatedTexts([text])[0];
}
