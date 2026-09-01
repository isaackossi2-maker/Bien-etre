import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { Exam } from "../../types";
import { useTranslatedText, useTranslatedTexts } from "../../i18n/useTranslatedContent";

type Stage = "intro" | "in-progress" | "result";

const MAX_VIOLATIONS = 3;
const LOCKDOWN_GRACE_MS = 1500;

export default function UserExamTake() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [violations, setViolations] = useState(0);
  const [violationNotice, setViolationNotice] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const stageRef = useRef<Stage>("intro");
  const lockdownStartedAtRef = useRef(0);
  const selectionsRef = useRef<Record<string, string[]>>({});

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // Les écouteurs de verrouillage (onglet, retour arrière...) sont posés une seule fois au
  // démarrage de l'examen : ils doivent lire les réponses actuelles via une ref plutôt que
  // via la closure de "selections", qui serait sinon figée à l'instant du montage.
  useEffect(() => {
    selectionsRef.current = selections;
  }, [selections]);

  useEffect(() => {
    api
      .get<Exam>(`/exams/${id}`)
      .then((res) => setExam(res.data))
      .catch((err) => {
        setError(err.response?.data?.message ?? t("examTake.loadError"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = useCallback(
    async (auto?: boolean) => {
      if (!exam || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      const answers = Object.entries(selectionsRef.current).map(([questionId, answerIds]) => ({ questionId, answerIds }));
      try {
        const { data } = await api.post(`/exams/${exam.id}/submit`, { answers });
        setResult(data);
        setStage("result");
        if (auto) setViolationNotice(t("examTake.autoSubmitted"));
      } catch (err: any) {
        submittedRef.current = false;
        setError(err.response?.data?.message ?? t("examTake.submitError"));
      } finally {
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exam]
  );

  // ---------- Verrouillage de l'écran pendant l'épreuve ----------

  function registerViolation(reason: string) {
    if (stageRef.current !== "in-progress") return;
    setViolations((v) => {
      const next = v + 1;
      if (next >= MAX_VIOLATIONS) {
        setViolationNotice(reason + t("examTake.violationFinal"));
        handleSubmit(true);
      } else {
        setViolationNotice(reason + t("examTake.violationCounter", { count: next, max: MAX_VIOLATIONS }));
      }
      return next;
    });
  }

  function startExam() {
    setStage("in-progress");
    lockdownStartedAtRef.current = Date.now();
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        // Le plein écran peut être refusé par le navigateur : l'examen continue quand même,
        // les autres protections (onglet, copier-coller, retour arrière) restent actives.
      });
    }
    if (exam?.duration) setRemainingSeconds(exam.duration * 60);
    // Piège pour le bouton "Précédent" du navigateur.
    window.history.pushState(null, "", window.location.href);
  }

  useEffect(() => {
    if (stage !== "in-progress") return;

    // La transition d'entrée en plein écran elle-même peut déclencher un "blur" ou un
    // "fullscreenchange" transitoire (selon navigateur/OS) avant que l'étudiant n'ait rien
    // fait — sans ce délai de grâce, ça grillait une tentative sur les trois dès le démarrage.
    function withinGracePeriod() {
      return Date.now() - lockdownStartedAtRef.current < LOCKDOWN_GRACE_MS;
    }

    function onVisibilityChange() {
      if (document.hidden && !withinGracePeriod()) registerViolation(t("examTake.leftTab"));
    }
    function onBlur() {
      if (!withinGracePeriod()) registerViolation(t("examTake.leftWindow"));
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement && !withinGracePeriod()) registerViolation(t("examTake.leftFullscreen"));
    }
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    function onCopyCutPaste(e: ClipboardEvent) {
      e.preventDefault();
    }
    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      const blockedCombo = (e.ctrlKey || e.metaKey) && ["c", "v", "x", "p", "u"].includes(key);
      const blockedDevtools = key === "f12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(key));
      if (blockedCombo || blockedDevtools) e.preventDefault();
    }
    function onPopState() {
      if (stageRef.current !== "in-progress") return;
      window.history.pushState(null, "", window.location.href);
      registerViolation(t("examTake.backBlocked"));
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopyCutPaste);
    document.addEventListener("cut", onCopyCutPaste);
    document.addEventListener("paste", onCopyCutPaste);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopyCutPaste);
      document.removeEventListener("cut", onCopyCutPaste);
      document.removeEventListener("paste", onCopyCutPaste);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Libère le plein écran une fois l'épreuve terminée (soumission manuelle, auto ou fin du temps).
  useEffect(() => {
    if (stage === "result" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [stage]);

  useEffect(() => {
    if (remainingSeconds === null || stage !== "in-progress") return;
    if (remainingSeconds <= 0) {
      handleSubmit();
      return;
    }
    const timer = setTimeout(() => setRemainingSeconds((s) => (s !== null ? s - 1 : s)), 1000);
    return () => clearTimeout(timer);
  }, [remainingSeconds, stage, handleSubmit]);

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

  function leaveExam() {
    navigate("/app/exams");
  }

  const examTitle = useTranslatedText(exam?.title);
  const examDescription = useTranslatedText(exam?.description);
  const questionTexts = useTranslatedTexts(exam?.questions?.map((q) => q.text) ?? []);
  const answerTexts = useTranslatedTexts(exam?.questions?.flatMap((q) => q.answers.map((a) => a.text)) ?? []);

  if (error) {
    return (
      <div style={wrap}>
        <div className="card" style={{ maxWidth: 420 }}>
          <h1>{t("examTake.unavailableTitle")}</h1>
          <p>{error}</p>
          <button className="btn btn-outline" onClick={leaveExam}>
            {t("examTake.backToExams")}
          </button>
        </div>
      </div>
    );
  }

  if (!exam) {
    return <div style={wrap}>{t("examTake.loading")}</div>;
  }

  if (stage === "result") {
    return (
      <div style={wrap}>
        <div className="card" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1>{t("examTake.resultTitle")}</h1>
          {violationNotice && (
            <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{violationNotice}</p>
          )}
          {result && (
            <p style={{ fontSize: "1.4rem" }}>
              {result.score} / {result.total}
            </p>
          )}
          <button className="btn btn-primary" onClick={leaveExam}>
            {t("examTake.backToExams")}
          </button>
        </div>
      </div>
    );
  }

  if (stage === "intro") {
    return (
      <div style={wrap}>
        <div className="card" style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ marginTop: 0 }}>{examTitle}</h1>
          {exam.description && <p style={{ color: "var(--text-muted)" }}>{examDescription}</p>}
          <div className="hint-box" style={{ textAlign: "left" }}>
            {t("examTake.introInstructions", { max: MAX_VIOLATIONS })}
            {exam.duration && t("examTake.introDuration", { duration: exam.duration })}
          </div>
          <button className="btn btn-primary" onClick={startExam} disabled={(exam.questions ?? []).length === 0}>
            {t("examTake.start")}
          </button>
          {(exam.questions ?? []).length === 0 && (
            <p className="empty-state">{t("examTake.noQuestions")}</p>
          )}
        </div>
      </div>
    );
  }

  const questions = exam.questions ?? [];
  const allAnswered = questions.length > 0 && questions.every((q) => (selections[q.id]?.length ?? 0) > 0);

  const minutes = remainingSeconds !== null ? Math.floor(remainingSeconds / 60) : null;
  const seconds = remainingSeconds !== null ? remainingSeconds % 60 : null;

  return (
    <div style={{ minHeight: "100vh", padding: "24px 24px 60px", userSelect: "none" }}>
      <div
        className="page-header"
        style={{ position: "sticky", top: 0, background: "var(--bg)", paddingBottom: 12, zIndex: 10 }}
      >
        <h1>{examTitle}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge badge-admin">{t("examTake.locked", { count: violations, max: MAX_VIOLATIONS })}</span>
          {remainingSeconds !== null && (
            <span className={`badge ${remainingSeconds <= 60 ? "badge-admin" : "badge-user"}`}>
              {t("examTake.remainingTime", { time: `${minutes}:${String(seconds).padStart(2, "0")}` })}
            </span>
          )}
        </div>
      </div>

      {violationNotice && (
        <p className="error-text" style={{ marginTop: 0 }}>
          {violationNotice}
        </p>
      )}

      {(() => {
        let answerCursor = 0;
        return questions.map((q, idx) => {
          const answerStart = answerCursor;
          answerCursor += q.answers.length;
          return (
            <div key={q.id} className="card" style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600 }}>
                {idx + 1}. {questionTexts[idx]}{" "}
                {q.type === "MULTIPLE" && (
                  <span className="badge badge-admin" style={{ fontWeight: 400 }}>
                    {t("examTake.mcqBadge")}
                  </span>
                )}
              </p>
              {q.answers.map((a, aIdx) => (
                <label key={a.id} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <input
                    type={q.type === "MULTIPLE" ? "checkbox" : "radio"}
                    name={q.id}
                    checked={(selections[q.id] ?? []).includes(a.id)}
                    onChange={() => (q.type === "MULTIPLE" ? toggleMultiple(q.id, a.id) : selectSingle(q.id, a.id))}
                  />
                  {answerTexts[answerStart + aIdx]}
                </label>
              ))}
            </div>
          );
        });
      })()}

      <button className="btn btn-primary" disabled={!allAnswered || submitting} onClick={() => handleSubmit()}>
        {submitting ? t("examTake.submitting") : t("examTake.submit")}
      </button>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};
