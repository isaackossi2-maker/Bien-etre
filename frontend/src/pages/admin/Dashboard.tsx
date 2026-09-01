import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import PostFeed from "../../components/PostFeed";
import Avatar from "../../components/Avatar";
import { User } from "../../types";

const BG_COLORS = [
  { key: "bgDefault", value: "" },
  { key: "bgBlue", value: "#e0f2fe" },
  { key: "bgGreen", value: "#dcfce7" },
  { key: "bgYellow", value: "#fef9c3" },
  { key: "bgPink", value: "#fce7f3" },
  { key: "bgPurple", value: "#ede9fe" },
] as const;

export default function Dashboard() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [newPost, setNewPost] = useState("");
  const [background, setBackground] = useState("");
  const [recipientMode, setRecipientMode] = useState<"all" | "specific">("all");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (showForm && users.length === 0) {
      api.get<User[]>("/users").then((res) => setUsers(res.data));
    }
  }, [showForm, users.length]);

  function toggleRecipient(id: string) {
    setSelectedRecipients((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function handlePublish(e: FormEvent) {
    e.preventDefault();
    setPublishError(null);
    if (!newPost.trim()) return;
    // Sans ce contrôle, choisir "Utilisateurs spécifiques" sans en cocher aucun envoyait le
    // post avec recipientIds: [], qui n'atteignait donc personne, sans aucune erreur visible.
    if (recipientMode === "specific" && selectedRecipients.length === 0) {
      setPublishError(t("adminDashboard.noRecipientsSelected"));
      return;
    }
    await api.post("/posts", {
      content: newPost,
      background: background || undefined,
      recipientIds: recipientMode === "specific" ? selectedRecipients : undefined,
    });
    setNewPost("");
    setBackground("");
    setRecipientMode("all");
    setSelectedRecipients([]);
    setShowForm(false);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t("adminDashboard.title")}</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? t("common.cancel") : t("adminDashboard.newPost")}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-grid" onSubmit={handlePublish}>
            <label>
              {t("adminDashboard.publishLabel")}
              <textarea value={newPost} onChange={(e) => setNewPost(e.target.value)} rows={3} required />
            </label>

            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t("adminDashboard.backgroundLabel")}</span>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {BG_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    title={t(`adminDashboard.${c.key}`)}
                    onClick={() => setBackground(c.value)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      cursor: "pointer",
                      background: c.value || "var(--surface)",
                      border: background === c.value ? "2px solid var(--primary)" : "1px solid var(--border)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t("adminDashboard.recipients")}</span>
              <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <input type="radio" checked={recipientMode === "all"} onChange={() => setRecipientMode("all")} />
                  {t("adminDashboard.everyone")}
                </label>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    checked={recipientMode === "specific"}
                    onChange={() => setRecipientMode("specific")}
                  />
                  {t("adminDashboard.specificUsers")}
                </label>
              </div>
              {recipientMode === "specific" && (
                <div
                  style={{
                    marginTop: 8,
                    maxHeight: 160,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  {users.map((u) => (
                    <label key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: "3px 0" }}>
                      <input
                        type="checkbox"
                        checked={selectedRecipients.includes(u.id)}
                        onChange={() => toggleRecipient(u.id)}
                      />
                      <Avatar name={u.name} avatar={u.avatar} size={24} />
                      {u.name} ({u.email})
                    </label>
                  ))}
                </div>
              )}
            </div>

            {publishError && <span className="error-text">{publishError}</span>}
            <button className="btn btn-primary" type="submit">
              {t("adminDashboard.publish")}
            </button>
          </form>
        </div>
      )}

      <PostFeed key={refreshKey} canPublish />
    </div>
  );
}
