import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { Meditation } from "../../types";
import { useTranslatedText, useTranslatedTexts } from "../../i18n/useTranslatedContent";

export default function UserMeditations() {
  const { t } = useTranslation();
  const [meditations, setMeditations] = useState<Meditation[]>([]);
  const [selected, setSelected] = useState<Meditation | null>(null);

  useEffect(() => {
    api.get<Meditation[]>("/meditations").then((res) => setMeditations(res.data));
  }, []);

  const titles = useTranslatedTexts(meditations.map((m) => m.title));
  const descriptions = useTranslatedTexts(meditations.map((m) => m.description));
  const selectedTitle = useTranslatedText(selected?.title);
  const selectedContent = useTranslatedText(selected?.content);

  return (
    <div>
      <div className="page-header">
        <h1>{t("userMeditations.title")}</h1>
      </div>

      {meditations.length === 0 ? (
        <p className="empty-state">{t("userMeditations.noMeditations")}</p>
      ) : (
        <div className="stat-grid">
          {meditations.map((m, idx) => (
            <div
              key={m.id}
              className="card"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSelected(m);
                api.post(`/meditations/${m.id}/view`);
              }}
            >
              <h3 style={{ marginTop: 0 }}>{titles[idx]}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{descriptions[idx]}</p>
              {m.duration && <span className="badge badge-user">{m.duration} min</span>}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="page-header">
            <h2 style={{ margin: 0 }}>{selectedTitle}</h2>
            <button className="btn btn-outline" onClick={() => setSelected(null)}>
              {t("userMeditations.close")}
            </button>
          </div>
          <p>{selectedContent}</p>
        </div>
      )}
    </div>
  );
}
