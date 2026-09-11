import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { DailyVerse } from "../types";
import { useTranslatedText } from "../i18n/useTranslatedContent";

interface DailyVerseCardProps {
  editable?: boolean;
}

export default function DailyVerseCard({ editable = false }: DailyVerseCardProps) {
  const { t, i18n } = useTranslation();
  const [verse, setVerse] = useState<DailyVerse | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftReference, setDraftReference] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<DailyVerse>("/meditations/daily-verse").then((res) => setVerse(res.data));
  }

  useEffect(load, []);

  const customText = useTranslatedText(verse?.isCustom ? verse.customText : null);
  const customReference = useTranslatedText(verse?.isCustom ? verse.customReference : null);

  if (!verse) return null;

  const displayText = verse.isCustom ? customText : i18n.language === "en" ? verse.textEn : verse.textFr;
  const displayReference = verse.isCustom
    ? customReference
    : i18n.language === "en"
      ? verse.referenceEn
      : verse.referenceFr;

  function startEdit() {
    setDraftText(verse!.isCustom ? verse!.customText ?? "" : "");
    setDraftReference(verse!.isCustom ? verse!.customReference ?? "" : "");
    setEditing(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put<DailyVerse>("/meditations/daily-verse", {
        customText: draftText.trim(),
        customReference: draftReference.trim() || undefined,
      });
      setVerse(res.data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      const res = await api.delete<DailyVerse>("/meditations/daily-verse");
      setVerse(res.data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20, background: "var(--surface-muted)" }}>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{t("dailyVerse.title")}</h3>
        {editable && !editing && (
          <div className="list-actions">
            <button className="btn btn-outline" onClick={startEdit}>
              {t("dailyVerse.customize")}
            </button>
            {verse.isCustom && (
              <button className="btn btn-outline" onClick={handleReset} disabled={saving}>
                {t("dailyVerse.backToAutomatic")}
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <form className="form-grid" onSubmit={handleSave}>
          <label>
            {t("dailyVerse.verseText")}
            <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={3} required />
          </label>
          <label>
            {t("dailyVerse.reference")}
            <input
              value={draftReference}
              onChange={(e) => setDraftReference(e.target.value)}
              placeholder={t("dailyVerse.referencePlaceholder")}
            />
          </label>
          <div className="list-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {t("common.save")}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setEditing(false)} disabled={saving}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p style={{ fontSize: "1.05rem", fontStyle: "italic", margin: 0 }}>« {displayText} »</p>
          {displayReference && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 8, marginBottom: 0 }}>
              {displayReference}
            </p>
          )}
        </>
      )}
    </div>
  );
}
