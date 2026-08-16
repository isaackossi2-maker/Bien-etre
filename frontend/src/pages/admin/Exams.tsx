import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Exam } from "../../types";

interface ExamFormState {
  title: string;
  description: string;
  duration: number | "";
  maxAttempts: number | "";
  isActive: boolean;
}

const emptyForm: ExamFormState = { title: "", description: "", duration: "", maxAttempts: "", isActive: true };

export default function AdminExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExamFormState>(emptyForm);

  function load() {
    api.get<Exam[]>("/exams").then((res) => setExams(res.data));
  }

  useEffect(load, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(exam: Exam) {
    setEditingId(exam.id);
    setForm({
      title: exam.title,
      description: exam.description ?? "",
      duration: exam.duration ?? "",
      maxAttempts: exam.maxAttempts ?? "",
      isActive: exam.isActive,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      description: form.description,
      duration: form.duration === "" ? null : Number(form.duration),
      maxAttempts: form.maxAttempts === "" ? null : Number(form.maxAttempts),
      isActive: form.isActive,
    };
    if (editingId) {
      await api.put(`/exams/${editingId}`, payload);
    } else {
      await api.post("/exams", payload);
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cet examen ? Les questions associées seront aussi supprimées.")) return;
    await api.delete(`/exams/${id}`);
    load();
  }

  async function toggleActive(exam: Exam) {
    await api.put(`/exams/${exam.id}`, { isActive: !exam.isActive });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Examens</h1>
        <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : startCreate())}>
          {showForm ? "Annuler" : "Nouvel examen"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Titre
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </label>
            <label>
              Durée (minutes, optionnel)
              <input
                type="number"
                min={1}
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </label>
            <label>
              Tentatives autorisées par utilisateur (vide = illimité)
              <input
                type="number"
                min={1}
                value={form.maxAttempts}
                onChange={(e) => setForm({ ...form, maxAttempts: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Accessible aux utilisateurs
            </label>
            <button className="btn btn-primary" type="submit">
              {editingId ? "Enregistrer" : "Créer"}
            </button>
          </form>
        </div>
      )}

      {exams.length === 0 ? (
        <p className="empty-state">Aucun examen pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Titre</th>
              <th>Description</th>
              <th>Questions</th>
              <th>Durée</th>
              <th>Tentatives max.</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.map((ex) => (
              <tr key={ex.id}>
                <td>{ex.title}</td>
                <td>{ex.description}</td>
                <td>{ex._count?.questions ?? 0}</td>
                <td>{ex.duration ? `${ex.duration} min` : "—"}</td>
                <td>{ex.maxAttempts ?? "Illimité"}</td>
                <td>
                  <span className={`badge ${ex.isActive ? "badge-user" : "badge-admin"}`}>
                    {ex.isActive ? "Accessible" : "Inaccessible"}
                  </span>
                </td>
                <td className="list-actions">
                  <Link className="btn btn-primary" to={`/admin/exams/${ex.id}/questions`}>
                    Gérer les questions
                  </Link>
                  <button className="btn btn-outline" onClick={() => startEdit(ex)}>
                    Modifier
                  </button>
                  <button className="btn btn-outline" onClick={() => toggleActive(ex)}>
                    {ex.isActive ? "Rendre inaccessible" : "Rendre accessible"}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(ex.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
