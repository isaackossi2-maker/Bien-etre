import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { Exam, QuestionType } from "../../types";
import { useCrudList } from "../../hooks/useCrudList";
import { useTranslatedTexts } from "../../i18n/useTranslatedContent";

interface ExamFormState {
  title: string;
  description: string;
  duration: number | "";
  maxAttempts: number | "";
  isActive: boolean;
}

interface AnswerDraft {
  text: string;
  isCorrect: boolean;
}

interface QuestionDraft {
  text: string;
  type: QuestionType;
  answers: AnswerDraft[];
}

const emptyForm: ExamFormState = { title: "", description: "", duration: "", maxAttempts: "", isActive: true };

const emptyAnswerDrafts = (): AnswerDraft[] => [
  { text: "", isCorrect: true },
  { text: "", isCorrect: false },
];

const emptyQuestionDraft = (): QuestionDraft => ({ text: "", type: "SINGLE", answers: emptyAnswerDrafts() });

export default function AdminExams() {
  const { t } = useTranslation();
  const { items: exams, create, update, remove, load } = useCrudList<Exam>("/exams");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExamFormState>(emptyForm);
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [exitPasswordInput, setExitPasswordInput] = useState("");
  const [clearExitPassword, setClearExitPassword] = useState(false);
  const [editingHasExitPassword, setEditingHasExitPassword] = useState(false);
  const examTitles = useTranslatedTexts(exams.map((e) => e.title));
  const examDescriptions = useTranslatedTexts(exams.map((e) => e.description));

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setQuestionDrafts([]);
    setFormError(null);
    setExitPasswordInput("");
    setClearExitPassword(false);
    setEditingHasExitPassword(false);
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
    setQuestionDrafts([]);
    setFormError(null);
    setExitPasswordInput("");
    setClearExitPassword(false);
    setEditingHasExitPassword(!!exam.hasExitPassword);
    setShowForm(true);
  }

  function addQuestionDraft() {
    setQuestionDrafts((prev) => [...prev, emptyQuestionDraft()]);
  }

  function removeQuestionDraft(qIdx: number) {
    setQuestionDrafts((prev) => prev.filter((_, i) => i !== qIdx));
  }

  function updateQuestionDraft(qIdx: number, patch: Partial<QuestionDraft>) {
    setQuestionDrafts((prev) => prev.map((q, i) => (i === qIdx ? { ...q, ...patch } : q)));
  }

  function changeQuestionType(qIdx: number, next: QuestionType) {
    setQuestionDrafts((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        if (next === "SINGLE") {
          // Ne garder qu'une seule réponse correcte (la première trouvée)
          const firstCorrect = q.answers.findIndex((a) => a.isCorrect);
          return {
            ...q,
            type: next,
            answers: q.answers.map((a, j) => ({ ...a, isCorrect: j === (firstCorrect === -1 ? 0 : firstCorrect) })),
          };
        }
        return { ...q, type: next };
      })
    );
  }

  function toggleCorrectDraft(qIdx: number, aIdx: number) {
    setQuestionDrafts((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        if (q.type === "SINGLE") return { ...q, answers: q.answers.map((a, j) => ({ ...a, isCorrect: j === aIdx })) };
        return { ...q, answers: q.answers.map((a, j) => (j === aIdx ? { ...a, isCorrect: !a.isCorrect } : a)) };
      })
    );
  }

  function updateAnswerDraft(qIdx: number, aIdx: number, patch: Partial<AnswerDraft>) {
    setQuestionDrafts((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, answers: q.answers.map((a, j) => (j === aIdx ? { ...a, ...patch } : a)) } : q))
    );
  }

  function addAnswerDraft(qIdx: number) {
    setQuestionDrafts((prev) => prev.map((q, i) => (i === qIdx ? { ...q, answers: [...q.answers, { text: "", isCorrect: false }] } : q)));
  }

  function removeAnswerDraft(qIdx: number, aIdx: number) {
    setQuestionDrafts((prev) => prev.map((q, i) => (i === qIdx ? { ...q, answers: q.answers.filter((_, j) => j !== aIdx) } : q)));
  }

  function validateQuestionDraft(q: QuestionDraft): string | null {
    if (q.answers.some((a) => !a.text.trim())) return t("adminExamQuestions.errorAllAnswersText");
    if (!q.answers.some((a) => a.isCorrect)) return t("adminExamQuestions.errorAtLeastOneCorrect");
    if (q.type === "SINGLE" && q.answers.filter((a) => a.isCorrect).length !== 1) {
      return t("adminExamQuestions.errorSingleChoiceOneCorrect");
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    for (const q of questionDrafts) {
      const err = validateQuestionDraft(q);
      if (err) {
        setFormError(err);
        return;
      }
    }
    const payload = {
      title: form.title,
      description: form.description,
      duration: form.duration === "" ? null : Number(form.duration),
      maxAttempts: form.maxAttempts === "" ? null : Number(form.maxAttempts),
      isActive: form.isActive,
      // Absent du payload = ne touche pas au mot de passe existant (édition). "" = le supprime.
      // Une valeur saisie la remplace. En création, absent = simplement aucun mot de passe.
      ...(clearExitPassword ? { exitPassword: "" } : exitPasswordInput.trim() ? { exitPassword: exitPasswordInput.trim() } : {}),
    };
    if (editingId) {
      await update(editingId, payload);
    } else if (questionDrafts.length > 0) {
      setSubmitting(true);
      try {
        const res = await api.post<Exam>("/exams", payload);
        for (const q of questionDrafts) {
          await api.post("/questions", { examId: res.data.id, text: q.text, type: q.type, answers: q.answers });
        }
        load();
      } catch (err: any) {
        setFormError(err.response?.data?.message ?? t("adminExamQuestions.saveError"));
        return;
      } finally {
        setSubmitting(false);
      }
    } else {
      await create(payload);
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setQuestionDrafts([]);
    setExitPasswordInput("");
    setClearExitPassword(false);
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

            <label>
              {editingId ? t("adminExams.exitPasswordEditLabel") : t("adminExams.exitPasswordCreateLabel")}
              <input
                type="text"
                value={exitPasswordInput}
                onChange={(e) => setExitPasswordInput(e.target.value)}
                disabled={clearExitPassword}
                placeholder={t("adminExams.exitPasswordPlaceholder")}
              />
            </label>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: "-8px 0 0" }}>
              {t("adminExams.exitPasswordHint")}
            </p>
            {editingId && editingHasExitPassword && (
              <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={clearExitPassword}
                  onChange={(e) => setClearExitPassword(e.target.checked)}
                />
                {t("adminExams.clearExitPassword")}
              </label>
            )}

            {!editingId && (
              <div style={{ marginTop: 4 }}>
                <div className="page-header" style={{ marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: "1rem" }}>{t("adminExams.questionsSectionTitle")}</h3>
                  <button type="button" className="btn btn-outline" onClick={addQuestionDraft}>
                    {t("adminExams.addQuestionInline")}
                  </button>
                </div>
                {questionDrafts.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
                    {t("adminExams.noQuestionsYetHint")}
                  </p>
                ) : (
                  questionDrafts.map((q, qIdx) => (
                    <div key={qIdx} className="card" style={{ marginBottom: 12, background: "var(--surface-muted)" }}>
                      <div className="page-header" style={{ marginBottom: 8 }}>
                        <strong>
                          {t("adminExamQuestions.question")} {qIdx + 1}
                        </strong>
                        <button type="button" className="btn btn-outline" onClick={() => removeQuestionDraft(qIdx)}>
                          {t("common.remove")}
                        </button>
                      </div>
                      <label>
                        {t("adminExamQuestions.question")}
                        <input
                          value={q.text}
                          onChange={(e) => updateQuestionDraft(qIdx, { text: e.target.value })}
                          required
                        />
                      </label>
                      <label>
                        {t("adminExamQuestions.questionType")}
                        <select
                          value={q.type}
                          onChange={(e) => changeQuestionType(qIdx, e.target.value as QuestionType)}
                        >
                          <option value="SINGLE">{t("adminExamQuestions.singleChoice")}</option>
                          <option value="MULTIPLE">{t("adminExamQuestions.multipleChoice")}</option>
                        </select>
                      </label>
                      <div>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                          {q.type === "SINGLE" ? t("adminExamQuestions.answersSingle") : t("adminExamQuestions.answersMultiple")}
                        </span>
                        {q.answers.map((a, aIdx) => (
                          <div key={aIdx} className="inline-form" style={{ marginTop: 8 }}>
                            <input
                              type={q.type === "SINGLE" ? "radio" : "checkbox"}
                              name={`correct-draft-${qIdx}`}
                              checked={a.isCorrect}
                              onChange={() => toggleCorrectDraft(qIdx, aIdx)}
                              title={t("adminExamQuestions.correctAnswerTitle")}
                            />
                            <input
                              style={{ flex: 1 }}
                              placeholder={t("adminExamQuestions.answerPlaceholder", { n: aIdx + 1 })}
                              value={a.text}
                              onChange={(e) => updateAnswerDraft(qIdx, aIdx, { text: e.target.value })}
                              required
                            />
                            {q.answers.length > 2 && (
                              <button type="button" className="btn btn-outline" onClick={() => removeAnswerDraft(qIdx, aIdx)}>
                                {t("common.remove")}
                              </button>
                            )}
                          </div>
                        ))}
                        <button type="button" className="btn btn-outline" style={{ marginTop: 8 }} onClick={() => addAnswerDraft(qIdx)}>
                          {t("adminExamQuestions.addAnswer")}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {formError && <span className="error-text">{formError}</span>}
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? t("common.saving") : editingId ? t("common.save") : t("common.create")}
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
                  {ex.hasExitPassword && (
                    <span className="badge badge-admin" style={{ marginLeft: 6 }} title={t("adminExams.exitPasswordBadgeTitle")}>
                      🔒
                    </span>
                  )}
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
