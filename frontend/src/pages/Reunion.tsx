import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCall } from "../call/CallContext";
import { Meeting } from "../types";
import { formatDateTime } from "../utils/date";
import { useTranslatedTexts } from "../i18n/useTranslatedContent";

export default function Reunion() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { meetingListVersion } = useCall();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [missedMeetings, setMissedMeetings] = useState<Meeting[]>([]);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<Meeting[]>("/meetings").then((res) => setMeetings(res.data));
    if (!isAdmin) {
      api.get<Meeting[]>("/meetings/missed").then((res) => setMissedMeetings(res.data));
    }
  }

  useEffect(load, []);
  // Une réunion créée OU terminée par quelqu'un d'autre pendant qu'on est sur cette page doit
  // se refléter dans la liste sans recharger la page (meetingListVersion change dans les deux
  // cas ; auparavant seule la création rechargeait, une réunion terminée gardait son bouton
  // "Rejoindre" affiché jusqu'à un rafraîchissement manuel).
  useEffect(() => {
    if (meetingListVersion > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingListVersion]);

  const meetingTitles = useTranslatedTexts(meetings.map((m) => m.title));
  const missedMeetingTitles = useTranslatedTexts(missedMeetings.map((m) => m.title));

  function linkFor(id: string) {
    return `${window.location.origin}/reunion/${id}`;
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post<Meeting>("/meetings", { title: title.trim() || undefined });
      navigate(`/reunion/${res.data.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(id: string) {
    try {
      await navigator.clipboard.writeText(linkFor(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
    } catch {
      window.prompt(t("reunion.copyLink") + " :", linkFor(id));
    }
  }

  async function endMeeting(id: string) {
    if (!confirm(t("reunion.confirmEnd"))) return;
    await api.post(`/meetings/${id}/end`);
    load();
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const raw = joinInput.trim();
    if (!raw) return;
    const match = raw.match(/([0-9a-fA-F-]{36})\s*$/);
    const id = match ? match[1] : raw;
    navigate(`/reunion/${id}`);
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t("reunion.title")}</h1>
      </div>

      {isAdmin && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t("reunion.createTitle")}</h3>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              {t("reunion.titleOptional")}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("reunion.titlePlaceholder", { name: user?.name ?? "" })}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? t("reunion.creating") : t("reunion.createAndStart")}
            </button>
          </form>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t("reunion.joinWithLink")}</h3>
        <form className="form-grid" onSubmit={handleJoin}>
          <label>
            {t("reunion.linkOrCode")}
            <input value={joinInput} onChange={(e) => setJoinInput(e.target.value)} placeholder={t("reunion.linkPlaceholder")} />
          </label>
          <button className="btn btn-outline" type="submit">
            {t("reunion.join")}
          </button>
        </form>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      </div>

      <h3>{t("reunion.current")}</h3>
      {meetings.length === 0 ? (
        <p className="empty-state">{t("reunion.noMeetings")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("reunion.meetingTitle")}</th>
              <th>{t("reunion.organizedBy")}</th>
              <th>{t("reunion.createdAt")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m, idx) => {
              const isMine = m.createdById === user?.id;
              return (
                <tr key={m.id}>
                  <td>{meetingTitles[idx]}</td>
                  <td>{isMine ? t("reunion.me") : m.createdBy?.name ?? t("common.none")}</td>
                  <td>{formatDateTime(m.createdAt, i18n.language)}</td>
                  <td className="list-actions">
                    <button className="btn btn-primary" onClick={() => navigate(`/reunion/${m.id}`)}>
                      {t("reunion.join")}
                    </button>
                    <button className="btn btn-outline" onClick={() => copyLink(m.id)}>
                      {copiedId === m.id ? t("reunion.linkCopied") : t("reunion.copyLink")}
                    </button>
                    {isMine && (
                      <button className="btn btn-danger" onClick={() => endMeeting(m.id)}>
                        {t("reunion.end")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!isAdmin && (
        <>
          <h3 style={{ marginTop: 28 }}>{t("reunion.missed")}</h3>
          {missedMeetings.length === 0 ? (
            <p className="empty-state">{t("reunion.noMissed")}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("reunion.meetingTitle")}</th>
                  <th>{t("reunion.organizedBy")}</th>
                  <th>{t("reunion.endedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {missedMeetings.map((m, idx) => (
                  <tr key={m.id}>
                    <td>{missedMeetingTitles[idx]}</td>
                    <td>{m.createdBy?.name ?? t("common.none")}</td>
                    <td>{m.endedAt ? formatDateTime(m.endedAt, i18n.language) : t("common.none")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
