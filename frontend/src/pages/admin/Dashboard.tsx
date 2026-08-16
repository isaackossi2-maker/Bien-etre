import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import PostFeed from "../../components/PostFeed";
import Avatar from "../../components/Avatar";
import { User } from "../../types";

const BG_COLORS = [
  { label: "Par défaut", value: "" },
  { label: "Bleu", value: "#e0f2fe" },
  { label: "Vert", value: "#dcfce7" },
  { label: "Jaune", value: "#fef9c3" },
  { label: "Rose", value: "#fce7f3" },
  { label: "Violet", value: "#ede9fe" },
];

export default function Dashboard() {
  const [showForm, setShowForm] = useState(false);
  const [newPost, setNewPost] = useState("");
  const [background, setBackground] = useState("");
  const [recipientMode, setRecipientMode] = useState<"all" | "specific">("all");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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
    if (!newPost.trim()) return;
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
        <h1>Tableau de bord</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Annuler" : "Nouvelle annonce"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-grid" onSubmit={handlePublish}>
            <label>
              Publier une annonce
              <textarea value={newPost} onChange={(e) => setNewPost(e.target.value)} rows={3} required />
            </label>

            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Fond du message</span>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {BG_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    onClick={() => setBackground(c.value)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      cursor: "pointer",
                      background: c.value || "#fff",
                      border: background === c.value ? "2px solid var(--primary)" : "1px solid var(--border)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Destinataires</span>
              <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <input type="radio" checked={recipientMode === "all"} onChange={() => setRecipientMode("all")} />
                  Tout le monde
                </label>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    checked={recipientMode === "specific"}
                    onChange={() => setRecipientMode("specific")}
                  />
                  Utilisateurs spécifiques
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

            <button className="btn btn-primary" type="submit">
              Publier
            </button>
          </form>
        </div>
      )}

      <PostFeed key={refreshKey} canPublish />
    </div>
  );
}
