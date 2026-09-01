import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCall } from "./CallContext";
import { useTranslatedText } from "../i18n/useTranslatedContent";

export default function MeetingAlertBanner() {
  const { t } = useTranslation();
  const { meetingAlert, dismissMeetingAlert } = useCall();
  const navigate = useNavigate();
  const title = useTranslatedText(meetingAlert?.title);

  if (!meetingAlert) return null;

  function join() {
    if (!meetingAlert) return;
    navigate(`/reunion/${meetingAlert.id}`);
    dismissMeetingAlert();
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2500,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        maxWidth: "min(480px, 92vw)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: "50%",
          background: "var(--primary)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.2rem",
        }}
      >
        🗓️
      </div>
      <div style={{ flex: 1, textAlign: "left" }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          {t("meetingAlert.startedBy", { name: meetingAlert.createdBy.name })}
        </div>
      </div>
      <button className="btn btn-primary" onClick={join}>
        {t("meetingAlert.join")}
      </button>
      <button
        onClick={dismissMeetingAlert}
        title={t("meetingAlert.dismiss")}
        style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "1.1rem", cursor: "pointer", padding: 4 }}
      >
        ✕
      </button>
    </div>
  );
}
