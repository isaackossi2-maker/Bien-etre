export type Testament = "AT" | "NT";

export interface BibleBook {
  // Clé utilisée comme index dans bible-lsg.json (sans accents).
  key: string;
  name: string;
  nameEn: string;
  testament: Testament;
}

// Ordre canonique, correspondant à l'ordre des clés dans bible-lsg.json
// (Louis Segond 1910, domaine public). Les noms anglais suivent la
// nomenclature standard (KJV) pour le même livre/ordre.
export const BIBLE_BOOKS: BibleBook[] = [
  { key: "Genese", name: "Genèse", nameEn: "Genesis", testament: "AT" },
  { key: "Exode", name: "Exode", nameEn: "Exodus", testament: "AT" },
  { key: "Levitique", name: "Lévitique", nameEn: "Leviticus", testament: "AT" },
  { key: "Nombres", name: "Nombres", nameEn: "Numbers", testament: "AT" },
  { key: "Deuteronome", name: "Deutéronome", nameEn: "Deuteronomy", testament: "AT" },
  { key: "Josue", name: "Josué", nameEn: "Joshua", testament: "AT" },
  { key: "Juges", name: "Juges", nameEn: "Judges", testament: "AT" },
  { key: "Ruth", name: "Ruth", nameEn: "Ruth", testament: "AT" },
  { key: "1Samuel", name: "1 Samuel", nameEn: "1 Samuel", testament: "AT" },
  { key: "2Samuel", name: "2 Samuel", nameEn: "2 Samuel", testament: "AT" },
  { key: "1Rois", name: "1 Rois", nameEn: "1 Kings", testament: "AT" },
  { key: "2Rois", name: "2 Rois", nameEn: "2 Kings", testament: "AT" },
  { key: "1Chroniques", name: "1 Chroniques", nameEn: "1 Chronicles", testament: "AT" },
  { key: "2Chroniques", name: "2 Chroniques", nameEn: "2 Chronicles", testament: "AT" },
  { key: "Esdras", name: "Esdras", nameEn: "Ezra", testament: "AT" },
  { key: "Nehemie", name: "Néhémie", nameEn: "Nehemiah", testament: "AT" },
  { key: "Esther", name: "Esther", nameEn: "Esther", testament: "AT" },
  { key: "Job", name: "Job", nameEn: "Job", testament: "AT" },
  { key: "Psaumes", name: "Psaumes", nameEn: "Psalms", testament: "AT" },
  { key: "Proverbes", name: "Proverbes", nameEn: "Proverbs", testament: "AT" },
  { key: "Ecclesiaste", name: "Ecclésiaste", nameEn: "Ecclesiastes", testament: "AT" },
  { key: "Cantique des cantiques", name: "Cantique des cantiques", nameEn: "Song of Solomon", testament: "AT" },
  { key: "Esaie", name: "Ésaïe", nameEn: "Isaiah", testament: "AT" },
  { key: "Jeremie", name: "Jérémie", nameEn: "Jeremiah", testament: "AT" },
  { key: "Lamentations", name: "Lamentations", nameEn: "Lamentations", testament: "AT" },
  { key: "Ezechiel", name: "Ézéchiel", nameEn: "Ezekiel", testament: "AT" },
  { key: "Daniel", name: "Daniel", nameEn: "Daniel", testament: "AT" },
  { key: "Osee", name: "Osée", nameEn: "Hosea", testament: "AT" },
  { key: "Joel", name: "Joël", nameEn: "Joel", testament: "AT" },
  { key: "Amos", name: "Amos", nameEn: "Amos", testament: "AT" },
  { key: "Abdias", name: "Abdias", nameEn: "Obadiah", testament: "AT" },
  { key: "Jonas", name: "Jonas", nameEn: "Jonah", testament: "AT" },
  { key: "Michee", name: "Michée", nameEn: "Micah", testament: "AT" },
  { key: "Nahum", name: "Nahum", nameEn: "Nahum", testament: "AT" },
  { key: "Habacuc", name: "Habacuc", nameEn: "Habakkuk", testament: "AT" },
  { key: "Sophonie", name: "Sophonie", nameEn: "Zephaniah", testament: "AT" },
  { key: "Aggee", name: "Aggée", nameEn: "Haggai", testament: "AT" },
  { key: "Zacharie", name: "Zacharie", nameEn: "Zechariah", testament: "AT" },
  { key: "Malachie", name: "Malachie", nameEn: "Malachi", testament: "AT" },

  { key: "Matthieu", name: "Matthieu", nameEn: "Matthew", testament: "NT" },
  { key: "Marc", name: "Marc", nameEn: "Mark", testament: "NT" },
  { key: "Luc", name: "Luc", nameEn: "Luke", testament: "NT" },
  { key: "Jean", name: "Jean", nameEn: "John", testament: "NT" },
  { key: "Actes", name: "Actes", nameEn: "Acts", testament: "NT" },
  { key: "Romains", name: "Romains", nameEn: "Romans", testament: "NT" },
  { key: "1Corinthiens", name: "1 Corinthiens", nameEn: "1 Corinthians", testament: "NT" },
  { key: "2Corinthiens", name: "2 Corinthiens", nameEn: "2 Corinthians", testament: "NT" },
  { key: "Galates", name: "Galates", nameEn: "Galatians", testament: "NT" },
  { key: "Ephesiens", name: "Éphésiens", nameEn: "Ephesians", testament: "NT" },
  { key: "Philippiens", name: "Philippiens", nameEn: "Philippians", testament: "NT" },
  { key: "Colossiens", name: "Colossiens", nameEn: "Colossians", testament: "NT" },
  { key: "1Thessaloniciens", name: "1 Thessaloniciens", nameEn: "1 Thessalonians", testament: "NT" },
  { key: "2Thessaloniciens", name: "2 Thessaloniciens", nameEn: "2 Thessalonians", testament: "NT" },
  { key: "1Timothee", name: "1 Timothée", nameEn: "1 Timothy", testament: "NT" },
  { key: "2Timothee", name: "2 Timothée", nameEn: "2 Timothy", testament: "NT" },
  { key: "Tite", name: "Tite", nameEn: "Titus", testament: "NT" },
  { key: "Philemon", name: "Philémon", nameEn: "Philemon", testament: "NT" },
  { key: "Hebreux", name: "Hébreux", nameEn: "Hebrews", testament: "NT" },
  { key: "Jacques", name: "Jacques", nameEn: "James", testament: "NT" },
  { key: "1Pierre", name: "1 Pierre", nameEn: "1 Peter", testament: "NT" },
  { key: "2Pierre", name: "2 Pierre", nameEn: "2 Peter", testament: "NT" },
  { key: "1Jean", name: "1 Jean", nameEn: "1 John", testament: "NT" },
  { key: "2Jean", name: "2 Jean", nameEn: "2 John", testament: "NT" },
  { key: "3Jean", name: "3 Jean", nameEn: "3 John", testament: "NT" },
  { key: "Jude", name: "Jude", nameEn: "Jude", testament: "NT" },
  { key: "Apocalypse", name: "Apocalypse", nameEn: "Revelation", testament: "NT" },
];
