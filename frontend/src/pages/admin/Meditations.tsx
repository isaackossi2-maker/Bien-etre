import { Fragment, FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { Meditation, MeditationView } from "../../types";

export default function AdminMeditations() {
  const [meditations, setMeditations] = useState<Meditation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [duration, setDuration] = useState<number | "">("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [views, setViews] = useState<MeditationView[]>([]);

  function load() {
    api.get<Meditation[]>("/meditations").then((res) => setMeditations(res.data));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    await api.post("/meditations", {
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
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette méditation ?")) return;
    await api.delete(`/meditations/${id}`);
    load();
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
        <h1>Méditations</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Annuler" : "Nouvelle méditation"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              Titre
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              Description
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label>
              Contenu
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
            </label>
            <label>
              Durée (minutes)
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Créer
            </button>
          </form>
        </div>
      )}

      {meditations.length === 0 ? (
        <p className="empty-state">Aucune méditation pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Titre</th>
              <th>Description</th>
              <th>Durée</th>
              <th>Vues</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {meditations.map((m) => (
              <Fragment key={m.id}>
                <tr>
                  <td>{m.title}</td>
                  <td>{m.description}</td>
                  <td>{m.duration ? `${m.duration} min` : "—"}</td>
                  <td>{m._count?.views ?? 0}</td>
                  <td className="list-actions">
                    <button className="btn btn-outline" onClick={() => toggleViews(m.id)}>
                      {viewingId === m.id ? "Masquer" : "Qui a vu ?"}
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(m.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
                {viewingId === m.id && (
                  <tr>
                    <td colSpan={5}>
                      {views.length === 0 ? (
                        <span style={{ color: "var(--text-muted)" }}>Personne n'a encore consulté cette méditation.</span>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {views.map((v) => (
                            <li key={v.id}>
                              {v.user.name} ({v.user.email}) — {new Date(v.viewedAt).toLocaleString("fr-FR")}
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
