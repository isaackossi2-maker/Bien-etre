import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { Exam, ExamResult, ExamResultDetail } from "../../types";
import { formatDateTime } from "../../utils/date";
import { useTranslatedText, useTranslatedTexts } from "../../i18n/useTranslatedContent";

export default function UserExams() {
  const { t, i18n } = useTranslation();
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

  const examTitles = useTranslatedTexts(exams.map((e) => e.title));
  const examDescriptions = useTranslatedTexts(exams.map((e) => e.description));
  const resultExamTitles = useTranslatedTexts(results.map((r) => r.exam?.title));
  const resultComments = useTranslatedTexts(results.map((r) => r.comment));
  const detailQuestionTexts = useTranslatedTexts(detail?.questions.map((q) => q.text) ?? []);
  const detailAnswerTexts = useTranslatedTexts(detail?.questions.flatMap((q) => q.answers.map((a) => a.text)) ?? []);
  const detailComment = useTranslatedText(detail?.comment);

  let answerCursor = 0;

  return (
    <div>
      <div className="page-header">
        <h1>{t("userExams.title")}</h1>
      </div>

      {exams.length === 0 ? (
        <p className="empty-state">{t("userExams.noExams")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("userExams.examTitle")}</th>
              <th>{t("userExams.description")}</th>
              <th>{t("userExams.questions")}</th>
              <th>{t("userExams.duration")}</th>
              <th>{t("userExams.attempts")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.map((ex, idx) => {
              const attemptsUsed = ex.attemptsUsed ?? 0;
              const limitReached = ex.maxAttempts != null && attemptsUsed >= ex.maxAttempts;
              return (
                <tr key={ex.id}>
                  <td>{examTitles[idx]}</td>
                  <td>{examDescriptions[idx]}</td>
                  <td>{ex._count?.questions ?? 0}</td>
                  <td>{ex.duration ? `${ex.duration} min` : t("userExams.unlimited")}</td>
                  <td>
                    {attemptsUsed} / {ex.maxAttempts ?? "∞"}
                  </td>
                  <td>
                    {limitReached ? (
                      <span className="badge badge-admin">{t("userExams.limitReached")}</span>
                    ) : (
                      <Link className="btn btn-primary" to={`/exam-session/${ex.id}`}>
                        {t("userExams.takeExam")}
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
          <h2 style={{ fontSize: "1.05rem" }}>{t("userExams.resultsHistory")}</h2>
          {results.map((r, idx) => (
            <div key={r.id} className="card" style={{ marginBottom: 16 }}>
              <div className="page-header" style={{ marginBottom: openId === r.id ? 16 : 0 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{resultExamTitles[idx]}</h3>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {formatDateTime(r.createdAt, i18n.language)}
                  </span>
                </div>
                <div className="list-actions" style={{ alignItems: "center" }}>
                  <span className="badge badge-user">
                    {r.score} / {r.total}
                  </span>
                  <button className="btn btn-outline" onClick={() => toggleCorrection(r)}>
                    {openId === r.id ? t("userExams.close") : t("userExams.viewCorrection")}
                  </button>
                </div>
              </div>

              {r.comment && openId !== r.id && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
                  {t("userExams.commentPrefix", { comment: resultComments[idx] })}
                </p>
              )}

              {openId === r.id && detail && (
                <div>
                  {detail.questions.map((q, qIdx) => {
                    const answerStart = answerCursor;
                    answerCursor += q.answers.length;
                    return (
                      <div key={q.id} className="card" style={{ marginBottom: 12, background: "var(--surface-muted)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <p style={{ fontWeight: 600, margin: 0 }}>
                            {qIdx + 1}. {detailQuestionTexts[qIdx]}
                          </p>
                          <span className={`badge ${q.isCorrect ? "badge-user" : "badge-admin"}`}>
                            {q.isCorrect ? t("userExams.correct") : t("userExams.incorrect")}
                          </span>
                        </div>
                        {q.answers.map((a, aIdx) => (
                          <div
                            key={a.id}
                            style={{
                              marginTop: 6,
                              color: a.isCorrect ? "var(--success)" : "inherit",
                              fontWeight: a.selected ? 700 : 400,
                            }}
                          >
                            {a.selected ? "☑" : "☐"} {detailAnswerTexts[answerStart + aIdx]}
                            {a.isCorrect && (
                              <span style={{ fontSize: "0.75rem", marginLeft: 6 }}>{t("userExams.correctAnswerSuffix")}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {detail.comment && (
                    <p style={{ color: "var(--text-muted)" }}>
                      <strong>{t("userExams.commentLabel")}</strong> {detailComment}
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
