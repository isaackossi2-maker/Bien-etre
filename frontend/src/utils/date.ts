export function localeFor(language: string): string {
  return language.startsWith("en") ? "en-US" : "fr-FR";
}

// Wrappers pour éviter de répéter `new Date(x).toLocaleString(localeFor(i18n.language))`
// dans chaque composant qui affiche une date (répété tel quel dans 9 fichiers).
export function formatDateTime(date: string | Date, language: string): string {
  return new Date(date).toLocaleString(localeFor(language));
}

export function formatDate(date: string | Date, language: string): string {
  return new Date(date).toLocaleDateString(localeFor(language));
}
