import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Exam, ExamResult, ExamResultDetail } from "../../types";

export default function UserExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExamResultDetail | null>(null);

  useEffect(() => {
    api.get<Exam[]>("/exams").then((res) => setExams(res.data));
    api.get<ExamResult[]>("/exams/results/all").then((res) => setResults(res.data));
  }, []);

  async function toggleCorrection(r: ExamResult) {
    if (openId === r.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    const res = await api.get<ExamResultDetail>(`/exams/results/${r.id}/detail`);
    setDetail(res.data);
    setOpenId(r.id);
  }

  return (
    <div>
      <div className="page-header">
        <h1>Examens</h1>
      </div>

      {exams.length === 0 ? (
        <p className="empty-state">Aucun examen disponible pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Titre</th>
              <th>Description</th>
              <th>Questions</th>
              <th>Durée</th>
              <th>Tentatives</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.map((ex) => {
              const attemptsUsed = ex.attemptsUsed ?? 0;
              const limitReached = ex.maxAttempts != null && attemptsUsed >= ex.maxAttempts;
              return (
                <tr key={ex.id}>
                  <td>{ex.title}</td>
                  <td>{ex.description}</td>
                  <td>{ex._count?.questions ?? 0}</td>
                  <td>{ex.duration ? `${ex.duration} min` : "Libre"}</td>
                  <td>
                    {attemptsUsed} / {ex.maxAttempts ?? "∞"}
                  </td>
                  <td>
                    {limitReached ? (
                      <span className="badge badge-admin">Limite atteinte</span>
                    ) : (
                      <Link className="btn btn-primary" to={`/app/exams/${ex.id}`}>
                        Passer l'examen
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: "1.05rem" }}>Historique de mes résultats</h2>
          {results.map((r) => (
            <div key={r.id} className="card" style={{ marginBottom: 16 }}>
              <div className="page-header" style={{ marginBottom: openId === r.id ? 16 : 0 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{r.exam?.title}</h3>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {new Date(r.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
                <div className="list-actions" style={{ alignItems: "center" }}>
                  <span className="badge badge-user">
                    {r.score} / {r.total}
                  </span>
                  <button className="btn btn-outline" onClick={() => toggleCorrection(r)}>
                    {openId === r.id ? "Fermer" : "Voir le corrigé"}
                  </button>
                </div>
              </div>

              {r.comment && openId !== r.id && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
                  Commentaire : {r.comment}
                </p>
              )}

              {openId === r.id && detail && (
                <div>
                  {detail.questions.map((q, idx) => (
                    <div key={q.id} className="card" style={{ marginBottom: 12, background: "#fafbfc" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <p style={{ fontWeight: 600, margin: 0 }}>
                          {idx + 1}. {q.text}
                        </p>
                        <span className={`badge ${q.isCorrect ? "badge-user" : "badge-admin"}`}>
                          {q.isCorrect ? "Correcte" : "Incorrecte"}
                        </span>
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
                  ))}
                  {detail.comment && (
                    <p style={{ color: "var(--text-muted)" }}>
                      <strong>Commentaire :</strong> {detail.comment}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
