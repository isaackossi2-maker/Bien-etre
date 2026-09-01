import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { Exam, Question, QuestionType } from "../../types";
import { useTranslatedText, useTranslatedTexts } from "../../i18n/useTranslatedContent";

interface AnswerDraft {
  text: string;
  isCorrect: boolean;
}

const emptyAnswers = (): AnswerDraft[] => [
  { text: "", isCorrect: true },
  { text: "", isCorrect: false },
];

export default function AdminExamQuestions() {
  const { t } = useTranslation();
  const { id: examId } = useParams<{ id: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [type, setType] = useState<QuestionType>("SINGLE");
  const [answers, setAnswers] = useState<AnswerDraft[]>(emptyAnswers());
  const [error, setError] = useState<string | null>(null);
  const examTitle = useTranslatedText(exam?.title);
  const questionTexts = useTranslatedTexts(questions.map((q) => q.text));
  const answerTexts = useTranslatedTexts(questions.flatMap((q) => q.answers.map((a) => a.text)));

  function load() {
    if (!examId) return;
    api.get<Exam>(`/exams/${examId}`).then((res) => setExam(res.data));
    api.get<Question[]>(`/questions?examId=${examId}`).then((res) => setQuestions(res.data));
  }

  useEffect(load, [examId]);

  function startCreate() {
    setEditingId(null);
    setText("");
    setType("SINGLE");
    setAnswers(emptyAnswers());
    setError(null);
    setShowForm(true);
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setText(q.text);
    setType(q.type);
    setAnswers(q.answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect })));
    setError(null);
    setShowForm(true);
  }

  function updateAnswer(index: number, patch: Partial<AnswerDraft>) {
    setAnswers((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function toggleCorrect(index: number) {
    setAnswers((prev) =>
      prev.map((a, i) => {
        if (type === "SINGLE") return { ...a, isCorrect: i === index };
        return i === index ? { ...a, isCorrect: !a.isCorrect } : a;
      })
    );
  }

  function changeType(next: QuestionType) {
    setType(next);
    if (next === "SINGLE") {
      // Ne garder qu'une seule réponse correcte (la première trouvée)
      setAnswers((prev) => {
        const firstCorrect = prev.findIndex((a) => a.isCorrect);
        return prev.map((a, i) => ({ ...a, isCorrect: i === (firstCorrect === -1 ? 0 : firstCorrect) }));
      });
    }
  }

  function addAnswer() {
    setAnswers((prev) => [...prev, { text: "", isCorrect: false }]);
  }

  function removeAnswer(index: number) {
    setAnswers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (answers.some((a) => !a.text.trim())) {
      setError(t("adminExamQuestions.errorAllAnswersText"));
      return;
    }
    if (!answers.some((a) => a.isCorrect)) {
      setError(t("adminExamQuestions.errorAtLeastOneCorrect"));
      return;
    }
    if (type === "SINGLE" && answers.filter((a) => a.isCorrect).length !== 1) {
      setError(t("adminExamQuestions.errorSingleChoiceOneCorrect"));
      return;
    }
    try {
      if (editingId) {
        await api.put(`/questions/${editingId}`, { text, type, answers });
      } else {
        await api.post("/questions", { examId, text, type, answers });
      }
      setShowForm(false);
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? t("adminExamQuestions.saveError"));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("adminExamQuestions.confirmDelete"))) return;
    await api.delete(`/questions/${id}`);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/admin/exams" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {t("adminExamQuestions.backToExams")}
          </Link>
          <h1 style={{ marginTop: 4 }}>{t("adminExamQuestions.title", { examTitle })}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => (showForm ? setShowForm(false) : startCreate())}>
          {showForm ? t("common.cancel") : t("adminExamQuestions.newQuestion")}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-grid" style={{ maxWidth: 600 }} onSubmit={handleSubmit}>
            <label>
              {t("adminExamQuestions.question")}
              <input value={text} onChange={(e) => setText(e.target.value)} required />
            </label>
            <label>
              {t("adminExamQuestions.questionType")}
              <select value={type} onChange={(e) => changeType(e.target.value as QuestionType)}>
                <option value="SINGLE">{t("adminExamQuestions.singleChoice")}</option>
                <option value="MULTIPLE">{t("adminExamQuestions.multipleChoice")}</option>
              </select>
            </label>

            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {type === "SINGLE" ? t("adminExamQuestions.answersSingle") : t("adminExamQuestions.answersMultiple")}
              </span>
              {answers.map((a, i) => (
                <div key={i} className="inline-form" style={{ marginTop: 8 }}>
                  <input
                    type={type === "SINGLE" ? "radio" : "checkbox"}
                    name="correct"
                    checked={a.isCorrect}
                    onChange={() => toggleCorrect(i)}
                    title={t("adminExamQuestions.correctAnswerTitle")}
                  />
                  <input
                    style={{ flex: 1 }}
                    placeholder={t("adminExamQuestions.answerPlaceholder", { n: i + 1 })}
                    value={a.text}
                    onChange={(e) => updateAnswer(i, { text: e.target.value })}
                    required
                  />
                  {answers.length > 2 && (
                    <button type="button" className="btn btn-outline" onClick={() => removeAnswer(i)}>
                      {t("common.remove")}
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-outline" style={{ marginTop: 8 }} onClick={addAnswer}>
                {t("adminExamQuestions.addAnswer")}
              </button>
            </div>

            {error && <span className="error-text">{error}</span>}
            <button className="btn btn-primary" type="submit">
              {editingId ? t("common.save") : t("adminExamQuestions.createQuestion")}
            </button>
          </form>
        </div>
      )}

      {questions.length === 0 ? (
        <p className="empty-state">{t("adminExamQuestions.noQuestions")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("adminExamQuestions.question")}</th>
              <th>{t("adminExamQuestions.questionType")}</th>
              <th>{t("adminExamQuestions.answers")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q, qIdx) => {
              const answerStart = questions.slice(0, qIdx).reduce((sum, prev) => sum + prev.answers.length, 0);
              return (
              <tr key={q.id}>
                <td>{questionTexts[qIdx]}</td>
                <td>
                  <span className={`badge ${q.type === "MULTIPLE" ? "badge-admin" : "badge-user"}`}>
                    {q.type === "MULTIPLE" ? t("adminExamQuestions.mcq") : t("adminExamQuestions.singleChoice")}
                  </span>
                </td>
                <td>
                  {q.answers.map((a, aIdx) => (
                    <div key={a.id} style={{ color: a.isCorrect ? "var(--success)" : "inherit" }}>
                      {a.isCorrect ? "✓ " : ""}
                      {answerTexts[answerStart + aIdx]}
                    </div>
                  ))}
                </td>
                <td className="list-actions">
                  <button className="btn btn-outline" onClick={() => startEdit(q)}>
                    {t("common.edit")}
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(q.id)}>
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
