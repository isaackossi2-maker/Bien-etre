import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Exam } from "../../types";
import { useCrudList } from "../../hooks/useCrudList";
import { useTranslatedTexts } from "../../i18n/useTranslatedContent";

interface ExamFormState {
  title: string;
  description: string;
  duration: number | "";
  maxAttempts: number | "";
  isActive: boolean;
}

const emptyForm: ExamFormState = { title: "", description: "", duration: "", maxAttempts: "", isActive: true };

export default function AdminExams() {
  const { t } = useTranslation();
  const { items: exams, create, update, remove } = useCrudList<Exam>("/exams");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExamFormState>(emptyForm);
  const examTitles = useTranslatedTexts(exams.map((e) => e.title));
  const examDescriptions = useTranslatedTexts(exams.map((e) => e.description));

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
      await update(editingId, payload);
    } else {
      await create(payload);
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    if (!confirm(t("adminExams.confirmDelete"))) return;
    await remove(id);
  }

  async function toggleActive(exam: Exam) {
    await update(exam.id, { isActive: !exam.isActive });
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t("adminExams.title")}</h1>
        <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : startCreate())}>
          {showForm ? t("common.cancel") : t("adminExams.newExam")}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              {t("adminExams.examTitle")}
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label>
              {t("adminExams.description")}
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </label>
            <label>
              {t("adminExams.durationOptional")}
              <input
                type="number"
                min={1}
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </label>
            <label>
              {t("adminExams.maxAttemptsLabel")}
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
              {t("adminExams.accessibleToUsers")}
            </label>
            <button className="btn btn-primary" type="submit">
              {editingId ? t("common.save") : t("common.create")}
            </button>
          </form>
        </div>
      )}

      {exams.length === 0 ? (
        <p className="empty-state">{t("adminExams.noExams")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("adminExams.examTitle")}</th>
              <th>{t("adminExams.description")}</th>
              <th>{t("adminExams.questions")}</th>
              <th>{t("adminExams.duration")}</th>
              <th>{t("adminExams.maxAttempts")}</th>
              <th>{t("adminExams.status")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.map((ex, idx) => (
              <tr key={ex.id}>
                <td>{examTitles[idx]}</td>
                <td>{examDescriptions[idx]}</td>
                <td>{ex._count?.questions ?? 0}</td>
                <td>{ex.duration ? `${ex.duration} min` : t("common.none")}</td>
                <td>{ex.maxAttempts ?? t("common.unlimited")}</td>
                <td>
                  <span className={`badge ${ex.isActive ? "badge-user" : "badge-admin"}`}>
                    {ex.isActive ? t("adminExams.accessible") : t("adminExams.inaccessible")}
                  </span>
                </td>
                <td className="list-actions">
                  <Link className="btn btn-primary" to={`/admin/exams/${ex.id}/questions`}>
                    {t("adminExams.manageQuestions")}
                  </Link>
                  <button className="btn btn-outline" onClick={() => startEdit(ex)}>
                    {t("common.edit")}
                  </button>
                  <button className="btn btn-outline" onClick={() => toggleActive(ex)}>
                    {ex.isActive ? t("adminExams.makeInaccessible") : t("adminExams.makeAccessible")}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(ex.id)}>
                    {t("common.delete")}
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
