import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { ExamResult, ExamResultDetail } from "../../types";

export default function AdminResults() {
  const [results, setResults] = useState<ExamResult[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExamResultDetail | null>(null);
  const [grades, setGrades] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const [scoreDraft, setScoreDraft] = useState(0);
  const [totalDraft, setTotalDraft] = useState(1);
  const [scoreTouched, setScoreTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<ExamResult[]>("/exams/results/all").then((res) => setResults(res.data));
  }

  useEffect(load, []);

  async function openCorrection(r: ExamResult) {
    if (openId === r.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    const res = await api.get<ExamResultDetail>(`/exams/results/${r.id}/detail`);
    setDetail(res.data);
    const initialGrades = Object.fromEntries(res.data.questions.map((q) => [q.id, q.isCorrect]));
    setGrades(initialGrades);
    setComment(res.data.comment ?? "");
    const initialScore = res.data.questions.filter((q) => q.isCorrect).length;
    setScoreDraft(initialScore);
    setTotalDraft(res.data.total);
    setScoreTouched(false);
    setOpenId(r.id);
  }

  function setGrade(questionId: string, isCorrect: boolean) {
    setGrades((prev) => {
      const next = { ...prev, [questionId]: isCorrect };
      if (!scoreTouched && detail) {
        setScoreDraft(detail.questions.filter((q) => next[q.id]).length);
      }
      return next;
    });
  }

  function handleScoreInput(value: number) {
    setScoreDraft(value);
    setScoreTouched(true);
  }

  function applySuggestion() {
    setScoreDraft(suggestedScore);
    setScoreTouched(false);
  }

  async function saveGrade() {
    if (!detail || scoreDraft > totalDraft) return;
    setSaving(true);
    try {
      const questionGrades = detail.questions.map((q) => ({ questionId: q.id, isCorrect: !!grades[q.id] }));
      await api.put(`/exams/results/${detail.id}/grade`, {
        score: scoreDraft,
        total: totalDraft,
        comment,
        questionGrades,
      });
      setOpenId(null);
      setDetail(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  const suggestedScore = detail ? detail.questions.filter((q) => grades[q.id]).length : 0;
  const scoreExceedsTotal = scoreDraft > totalDraft;

  return (
    <div>
      <div className="page-header">
        <h1>Notes</h1>
      </div>

      {results.length === 0 ? (
        <p className="empty-state">Aucun examen n'a encore été passé.</p>
      ) : (
        results.map((r) => (
          <div key={r.id} className="card" style={{ marginBottom: 16 }}>
            <div className="page-header" style={{ marginBottom: openId === r.id ? 16 : 0 }}>
              <div>
                <h3 style={{ margin: 0 }}>{r.exam?.title}</h3>
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  {r.user?.name} ({r.user?.email}) — {new Date(r.createdAt).toLocaleString("fr-FR")}
                </span>
              </div>
              <div className="list-actions" style={{ alignItems: "center" }}>
                <span className="badge badge-user">
                  {r.score} / {r.total}
                </span>
                <button className="btn btn-outline" onClick={() => openCorrection(r)}>
                  {openId === r.id ? "Fermer" : "Corriger"}
                </button>
              </div>
            </div>

            {openId === r.id && detail && (
              <div>
                {detail.questions.map((q, idx) => {
                  const isCorrect = !!grades[q.id];
                  return (
                    <div key={q.id} className="card" style={{ marginBottom: 12, background: "#fafbfc" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <p style={{ fontWeight: 600, margin: 0 }}>
                          {idx + 1}. {q.text}
                        </p>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            title="Marquer correcte"
                            onClick={() => setGrade(q.id, true)}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: isCorrect ? "none" : "1px solid var(--border)",
                              background: isCorrect ? "var(--success)" : "#fff",
                              color: isCorrect ? "#fff" : "var(--success)",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            title="Marquer incorrecte"
                            onClick={() => setGrade(q.id, false)}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: !isCorrect ? "none" : "1px solid var(--border)",
                              background: !isCorrect ? "var(--danger)" : "#fff",
                              color: !isCorrect ? "#fff" : "var(--danger)",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            ✗
                          </button>
                        </div>
                      </div>
                      {q.answers.map((a) => (
                        <div
                          key={a.id}
                          style={{
                            marginTop: 6,
                            color: a.isCorrect ? "var(--success)" : "inherit",
                            fontWeight: a.selected ? 700 : 400,
                          }}
                        >
                          {a.selected ? "☑" : "☐"} {a.text}
                          {a.isCorrect && <span style={{ fontSize: "0.75rem", marginLeft: 6 }}>(bonne réponse)</span>}
                        </div>
                      ))}
                    </div>
                  );
                })}

                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Commentaire</span>
                  <textarea
                    style={{ width: "100%", marginTop: 4 }}
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Un commentaire pour l'utilisateur (optionnel)..."
                  />
                </label>

                <div className="inline-form" style={{ alignItems: "center" }}>
                  <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    Note à attribuer
                    <input
                      type="number"
                      min={0}
                      value={scoreDraft}
                      onChange={(e) => handleScoreInput(Number(e.target.value))}
                      style={{ width: 70, borderColor: scoreExceedsTotal ? "var(--danger)" : undefined }}
                    />
                  </label>
                  <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    Barème (sur)
                    <input
                      type="number"
                      min={1}
                      value={totalDraft}
                      onChange={(e) => setTotalDraft(Number(e.target.value))}
                      style={{ width: 70 }}
                    />
                  </label>
                  {scoreTouched && (
                    <button type="button" className="btn btn-outline" onClick={applySuggestion}>
                      Revenir à la suggestion ({suggestedScore}/{detail.total})
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={saveGrade} disabled={saving || scoreExceedsTotal}>
                    {saving ? "Enregistrement..." : "Attribuer la note"}
                  </button>
                </div>
                {scoreExceedsTotal && (
                  <p className="error-text" style={{ marginTop: 8 }}>
                    La note ({scoreDraft}) ne peut pas dépasser le barème ({totalDraft}).
                  </p>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
