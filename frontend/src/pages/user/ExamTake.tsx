import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Exam } from "../../types";

export default function UserExamTake() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    api
      .get<Exam>(`/exams/${id}`)
      .then((res) => {
        setExam(res.data);
        if (res.data.duration) {
          setRemainingSeconds(res.data.duration * 60);
        }
      })
      .catch((err) => {
        setError(err.response?.data?.message ?? "Impossible de charger cet examen");
      });
  }, [id]);

  const handleSubmit = useCallback(async () => {
    if (!exam || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const answers = Object.entries(selections).map(([questionId, answerIds]) => ({ questionId, answerIds }));
    try {
      const { data } = await api.post(`/exams/${exam.id}/submit`, { answers });
      setResult(data);
    } catch (err: any) {
      submittedRef.current = false;
      setError(err.response?.data?.message ?? "Impossible d'envoyer vos réponses");
    } finally {
      setSubmitting(false);
    }
  }, [exam, selections]);

  useEffect(() => {
    if (remainingSeconds === null || result) return;
    if (remainingSeconds <= 0) {
      handleSubmit();
      return;
    }
    const timer = setTimeout(() => setRemainingSeconds((s) => (s !== null ? s - 1 : s)), 1000);
    return () => clearTimeout(timer);
  }, [remainingSeconds, result, handleSubmit]);

  function selectSingle(questionId: string, answerId: string) {
    setSelections((prev) => ({ ...prev, [questionId]: [answerId] }));
  }

  function toggleMultiple(questionId: string, answerId: string) {
    setSelections((prev) => {
      const current = prev[questionId] ?? [];
      const next = current.includes(answerId) ? current.filter((id) => id !== answerId) : [...current, answerId];
      return { ...prev, [questionId]: next };
    });
  }

  if (error) {
    return (
      <div className="card">
        <h1>Examen indisponible</h1>
        <p>{error}</p>
        <button className="btn btn-outline" onClick={() => navigate("/app/exams")}>
          Retour aux examens
        </button>
      </div>
    );
  }

  if (!exam) return <p>Chargement...</p>;

  if (result) {
    return (
      <div className="card">
        <h1>Résultat</h1>
        <p style={{ fontSize: "1.4rem" }}>
          {result.score} / {result.total}
        </p>
        <button className="btn btn-primary" onClick={() => navigate("/app/exams")}>
          Retour aux examens
        </button>
      </div>
    );
  }

  const questions = exam.questions ?? [];
  const allAnswered = questions.length > 0 && questions.every((q) => (selections[q.id]?.length ?? 0) > 0);

  const minutes = remainingSeconds !== null ? Math.floor(remainingSeconds / 60) : null;
  const seconds = remainingSeconds !== null ? remainingSeconds % 60 : null;

  return (
    <div>
      <div className="page-header">
        <h1>{exam.title}</h1>
        {remainingSeconds !== null && (
          <span className={`badge ${remainingSeconds <= 60 ? "badge-admin" : "badge-user"}`}>
            Temps restant : {minutes}:{String(seconds).padStart(2, "0")}
          </span>
        )}
      </div>

      {questions.length === 0 && (
        <p className="empty-state">Cet examen ne contient encore aucune question. Revenez plus tard.</p>
      )}

      {questions.map((q, idx) => (
        <div key={q.id} className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 600 }}>
            {idx + 1}. {q.text}{" "}
            {q.type === "MULTIPLE" && (
              <span className="badge badge-admin" style={{ fontWeight: 400 }}>
                QCM — plusieurs réponses possibles
              </span>
            )}
          </p>
          {q.answers.map((a) => (
            <label key={a.id} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <input
                type={q.type === "MULTIPLE" ? "checkbox" : "radio"}
                name={q.id}
                checked={(selections[q.id] ?? []).includes(a.id)}
                onChange={() => (q.type === "MULTIPLE" ? toggleMultiple(q.id, a.id) : selectSingle(q.id, a.id))}
              />
              {a.text}
            </label>
          ))}
        </div>
      ))}

      <button className="btn btn-primary" disabled={!allAnswered || submitting} onClick={handleSubmit}>
        {submitting ? "Envoi..." : "Soumettre mes réponses"}
      </button>
    </div>
  );
}
