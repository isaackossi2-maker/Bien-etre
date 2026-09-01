import { Fragment, FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { Meditation, MeditationView } from "../../types";
import { formatDateTime } from "../../utils/date";
import { useCrudList } from "../../hooks/useCrudList";
import { useTranslatedTexts } from "../../i18n/useTranslatedContent";

export default function AdminMeditations() {
  const { t, i18n } = useTranslation();
  const { items: meditations, create, remove } = useCrudList<Meditation>("/meditations");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [duration, setDuration] = useState<number | "">("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [views, setViews] = useState<MeditationView[]>([]);
  const meditationTitles = useTranslatedTexts(meditations.map((m) => m.title));
  const meditationDescriptions = useTranslatedTexts(meditations.map((m) => m.description));

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    await create({
      title,
      description,
      content,
      duration: duration === "" ? undefined : Number(duration),
    });
    setTitle("");
    setDescription("");
    setContent("");
    setDuration("");
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(t("adminMeditations.confirmDelete"))) return;
    await remove(id);
  }

  async function toggleViews(id: string) {
    if (viewingId === id) {
      setViewingId(null);
      return;
    }
    const res = await api.get<MeditationView[]>(`/meditations/${id}/views`);
    setViews(res.data);
    setViewingId(id);
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t("adminMeditations.title")}</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? t("common.cancel") : t("adminMeditations.newMeditation")}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              {t("adminMeditations.meditationTitle")}
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              {t("adminMeditations.description")}
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label>
              {t("adminMeditations.content")}
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
            </label>
            <label>
              {t("adminMeditations.durationMinutes")}
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            <button className="btn btn-primary" type="submit">
              {t("common.create")}
            </button>
          </form>
        </div>
      )}

      {meditations.length === 0 ? (
        <p className="empty-state">{t("adminMeditations.noMeditations")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("adminMeditations.meditationTitle")}</th>
              <th>{t("adminMeditations.description")}</th>
              <th>{t("adminMeditations.duration")}</th>
              <th>{t("adminMeditations.views")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {meditations.map((m, idx) => (
              <Fragment key={m.id}>
                <tr>
                  <td>{meditationTitles[idx]}</td>
                  <td>{meditationDescriptions[idx]}</td>
                  <td>{m.duration ? `${m.duration} min` : t("common.none")}</td>
                  <td>{m._count?.views ?? 0}</td>
                  <td className="list-actions">
                    <button className="btn btn-outline" onClick={() => toggleViews(m.id)}>
                      {viewingId === m.id ? t("adminMeditations.hide") : t("adminMeditations.whoViewed")}
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(m.id)}>
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
                {viewingId === m.id && (
                  <tr>
                    <td colSpan={5}>
                      {views.length === 0 ? (
                        <span style={{ color: "var(--text-muted)" }}>{t("adminMeditations.noViewsYet")}</span>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {views.map((v) => (
                            <li key={v.id}>
                              {v.user.name} ({v.user.email}) — {formatDateTime(v.viewedAt, i18n.language)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
