import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BIBLE_BOOKS, Testament } from "../data/bibleBooks";

type BibleData = Record<string, string[][]>;

interface Verse {
  number: number;
  text: string;
}

interface SearchHit {
  bookKey: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
}

const STORAGE_KEY = "bible:lastPosition";
const MAX_SEARCH_HITS = 100;

function parseVerse(raw: string): Verse {
  const match = raw.match(/^(\d+)\s+([\s\S]*)$/);
  if (!match) return { number: 0, text: raw };
  return { number: Number(match[1]), text: match[2].trim() };
}

function readStoredPosition(): { bookKey: string; chapter: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.bookKey === "string" && typeof parsed.chapter === "number") return parsed;
    }
  } catch {
    // valeur corrompue, on repart des valeurs par défaut
  }
  return { bookKey: "Genese", chapter: 1 };
}

export default function Bible() {
  const { t, i18n } = useTranslation();
  const bookName = (b: { name: string; nameEn: string }) => (i18n.language === "en" ? b.nameEn : b.name);
  const [data, setData] = useState<BibleData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo(readStoredPosition, []);
  const [bookKey, setBookKey] = useState(initial.bookKey);
  const [chapter, setChapter] = useState(initial.chapter);
  const [testament, setTestament] = useState<Testament>(
    BIBLE_BOOKS.find((b) => b.key === initial.bookKey)?.testament ?? "AT"
  );
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);

  useEffect(() => {
    const source = i18n.language === "en" ? "/bible-kjv.json" : "/bible-lsg.json";
    setData(null);
    setError(null);
    fetch(source)
      .then((res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json();
      })
      .then((json: BibleData) => setData(json))
      .catch(() => setError(t("bible.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookKey, chapter }));
  }, [bookKey, chapter]);

  const book = BIBLE_BOOKS.find((b) => b.key === bookKey) ?? BIBLE_BOOKS[0];
  const booksInTestament = BIBLE_BOOKS.filter((b) => b.testament === testament);
  const chapterCount = data?.[bookKey]?.length ?? 0;
  const verses: Verse[] = (data?.[bookKey]?.[chapter - 1] ?? []).map(parseVerse);

  function selectBook(key: string) {
    setBookKey(key);
    setChapter(1);
    setSearchHits(null);
  }

  function goToChapter(nextBookKey: string, nextChapter: number) {
    setBookKey(nextBookKey);
    setChapter(nextChapter);
    setSearchHits(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goPrev() {
    if (!data) return;
    if (chapter > 1) {
      goToChapter(bookKey, chapter - 1);
      return;
    }
    const idx = BIBLE_BOOKS.findIndex((b) => b.key === bookKey);
    const prevBook = BIBLE_BOOKS[idx - 1];
    if (prevBook) {
      setTestament(prevBook.testament);
      goToChapter(prevBook.key, data[prevBook.key]?.length ?? 1);
    }
  }

  function goNext() {
    if (!data) return;
    if (chapter < chapterCount) {
      goToChapter(bookKey, chapter + 1);
      return;
    }
    const idx = BIBLE_BOOKS.findIndex((b) => b.key === bookKey);
    const nextBook = BIBLE_BOOKS[idx + 1];
    if (nextBook) {
      setTestament(nextBook.testament);
      goToChapter(nextBook.key, 1);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const term = query.trim().toLowerCase();
    if (!term) {
      setSearchHits(null);
      return;
    }
    const hits: SearchHit[] = [];
    for (const b of BIBLE_BOOKS) {
      const chapters = data[b.key];
      if (!chapters) continue;
      for (let c = 0; c < chapters.length; c++) {
        for (const raw of chapters[c]) {
          if (raw.toLowerCase().includes(term)) {
            const v = parseVerse(raw);
            hits.push({ bookKey: b.key, bookName: bookName(b), chapter: c + 1, verse: v.number, text: v.text });
            if (hits.length >= MAX_SEARCH_HITS) break;
          }
        }
        if (hits.length >= MAX_SEARCH_HITS) break;
      }
      if (hits.length >= MAX_SEARCH_HITS) break;
    }
    setSearchHits(hits);
  }

  function openHit(hit: SearchHit) {
    const hitBook = BIBLE_BOOKS.find((b) => b.key === hit.bookKey);
    if (hitBook) setTestament(hitBook.testament);
    goToChapter(hit.bookKey, hit.chapter);
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t("bible.title")}</h1>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t("bible.searchTitle")}</h3>
        <form className="inline-form" onSubmit={handleSearch}>
          <input
            style={{ flex: 1, minWidth: 220 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("bible.searchPlaceholder")}
          />
          <button className="btn btn-primary" type="submit" disabled={!data}>
            {t("bible.search")}
          </button>
          {searchHits && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setQuery("");
                setSearchHits(null);
              }}
            >
              {t("bible.clear")}
            </button>
          )}
        </form>

        {searchHits && (
          <div style={{ marginTop: 16 }}>
            {searchHits.length === 0 ? (
              <p className="empty-state">{t("bible.noResults")}</p>
            ) : (
              <>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  {searchHits.length >= MAX_SEARCH_HITS
                    ? t("bible.tooManyResults", { max: MAX_SEARCH_HITS })
                    : t("bible.resultsCount", { count: searchHits.length })}
                </p>
                <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {searchHits.map((hit, i) => (
                    <div
                      key={i}
                      onClick={() => openHit(hit)}
                      style={{
                        cursor: "pointer",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--surface-muted)",
                      }}
                    >
                      <strong>
                        {hit.bookName} {hit.chapter}:{hit.verse}
                      </strong>
                      <div style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>{hit.text}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {!error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="list-actions" style={{ marginBottom: 14 }}>
            {(["AT", "NT"] as Testament[]).map((tst) => (
              <button
                key={tst}
                type="button"
                className={testament === tst ? "btn btn-primary" : "btn btn-outline"}
                onClick={() => setTestament(tst)}
              >
                {tst === "AT" ? t("bible.oldTestament") : t("bible.newTestament")}
              </button>
            ))}
          </div>

          <div className="inline-form">
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {t("bible.book")}
              <select value={bookKey} onChange={(e) => selectBook(e.target.value)}>
                {booksInTestament.map((b) => (
                  <option key={b.key} value={b.key}>
                    {bookName(b)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {t("bible.chapter")}
              <select value={chapter} onChange={(e) => goToChapter(bookKey, Number(e.target.value))}>
                {Array.from({ length: chapterCount || 1 }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {!error && (
        <div className="card">
          {!data ? (
            <p className="empty-state">{t("bible.loadingText")}</p>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>
                {bookName(book)} {chapter}
              </h2>
              <div style={{ lineHeight: 1.9, fontSize: "1rem" }}>
                {verses.map((v, idx) => (
                  // Index plutôt que v.number : quelques chapitres de la source contiennent des
                  // numéros de versets dupliqués/mal formés (lignes source malformées), ce qui
                  // provoquait des clés React en collision et des versets manquants à l'affichage.
                  <p key={idx} style={{ margin: "0 0 8px" }}>
                    <sup style={{ color: "var(--primary)", fontWeight: 700, marginRight: 4 }}>{v.number}</sup>
                    {v.text}
                  </p>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
                <button className="btn btn-outline" onClick={goPrev}>
                  {t("bible.previous")}
                </button>
                <button className="btn btn-outline" onClick={goNext}>
                  {t("bible.next")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
