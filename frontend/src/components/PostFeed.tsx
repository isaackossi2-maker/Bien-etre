import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { Post } from "../types";
import Avatar from "./Avatar";
import { formatDateTime } from "../utils/date";
import { useTranslatedTexts } from "../i18n/useTranslatedContent";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

export default function PostFeed({ canPublish }: { canPublish: boolean }) {
  const { t, i18n } = useTranslation();
  const [posts, setPosts] = useState<Post[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [openReactionPicker, setOpenReactionPicker] = useState<string | null>(null);

  function load() {
    api.get<Post[]>("/posts").then((res) => setPosts(res.data));
  }

  useEffect(load, []);

  async function handleDelete(id: string) {
    if (!confirm(t("postFeed.confirmDelete"))) return;
    await api.delete(`/posts/${id}`);
    load();
  }

  async function handleReact(id: string, emoji: string) {
    setOpenReactionPicker(null);
    await api.post(`/posts/${id}/react`, { emoji });
    load();
  }

  async function handleComment(id: string) {
    const content = commentDrafts[id];
    if (!content?.trim()) return;
    await api.post(`/posts/${id}/comments`, { content });
    setCommentDrafts((prev) => ({ ...prev, [id]: "" }));
    setExpandedComments((prev) => ({ ...prev, [id]: true }));
    load();
  }

  const postContents = useTranslatedTexts(posts.map((p) => p.content));
  const commentContents = useTranslatedTexts(posts.flatMap((p) => p.comments.map((c) => c.content)));
  let commentCursor = 0;

  return (
    <div>
      {posts.length === 0 ? (
        <p className="empty-state">{t("postFeed.noPosts")}</p>
      ) : (
        posts.map((p, postIdx) => {
          const commentsOpen = !!expandedComments[p.id];
          const reactionEntries = Object.entries(p.reactionSummary);
          const commentStart = commentCursor;
          commentCursor += p.comments.length;
          return (
            <div
              key={p.id}
              className="card"
              style={
                {
                  marginBottom: 16,
                  background: p.background || undefined,
                  position: "relative",
                  // Les fonds pastel de la palette sont volontairement clairs et fixes :
                  // le texte doit rester sombre même en thème sombre, sinon il devient illisible.
                  // "color" fixe le texte hérité par défaut (contenu, nom d'auteur...) ; les
                  // variables couvrent les éléments qui référencent explicitement var(--text...).
                  ...(p.background
                    ? { color: "#1c2130", "--text": "#1c2130", "--text-muted": "#5b6272" }
                    : {}),
                } as React.CSSProperties
              }
            >
              <div className="page-header" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={p.author.name} avatar={p.author.avatar} size={38} />
                  <div>
                    <span style={{ fontWeight: 600 }}>{p.author.name}</span>{" "}
                    <span className="badge badge-admin">{t("common.admin")}</span>
                    {p.recipients.length > 0 && (
                      <span
                        className="badge badge-user"
                        style={{ marginLeft: 6 }}
                        title={p.recipients.map((r) => r.name).join(", ")}
                      >
                        {t("postFeed.targeted", { count: p.recipients.length })}
                      </span>
                    )}
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {formatDateTime(p.createdAt, i18n.language)}
                    </div>
                  </div>
                </div>
                {canPublish && (
                  <button className="btn btn-outline" onClick={() => handleDelete(p.id)}>
                    {t("postFeed.delete")}
                  </button>
                )}
              </div>
              <p style={{ whiteSpace: "pre-wrap" }}>{postContents[postIdx]}</p>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, position: "relative" }}>
                <button
                  className={`btn ${p.myReaction ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setOpenReactionPicker(openReactionPicker === p.id ? null : p.id)}
                >
                  {p.myReaction ?? "👍"} {t("postFeed.react")}
                </button>
                {reactionEntries.length > 0 && (
                  <div style={{ display: "flex", gap: 6, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    {reactionEntries.map(([emoji, count]) => (
                      <span key={emoji}>
                        {emoji} {count}
                      </span>
                    ))}
                  </div>
                )}

                {openReactionPicker === p.id && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: 0,
                      marginBottom: 6,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "6px 10px",
                      display: "flex",
                      gap: 6,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      zIndex: 10,
                    }}
                  >
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReact(p.id, emoji)}
                        style={{
                          border: "none",
                          background: "transparent",
                          fontSize: "1.3rem",
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="btn btn-outline"
                style={{ marginBottom: commentsOpen ? 10 : 0 }}
                onClick={() => setExpandedComments((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
              >
                {commentsOpen ? t("postFeed.hideComments") : t("postFeed.comments", { count: p.comments.length })}
              </button>

              {commentsOpen && (
                <>
                  {p.comments.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      {p.comments.map((c, cIdx) => (
                        <div key={c.id} style={{ marginBottom: 8, fontSize: "0.88rem", display: "flex", gap: 8 }}>
                          <Avatar name={c.user.name} avatar={c.user.avatar} size={26} />
                          <div>
                            <strong>{c.user.name}</strong>
                            {c.user.role === "ADMIN" && (
                              <span className="badge badge-admin" style={{ marginLeft: 6 }}>
                                {t("common.admin")}
                              </span>
                            )}
                            <div>{commentContents[commentStart + cIdx]}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="inline-form">
                    <input
                      style={{ flex: 1 }}
                      placeholder={t("postFeed.commentPlaceholder")}
                      value={commentDrafts[p.id] ?? ""}
                      onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                    <button className="btn btn-outline" onClick={() => handleComment(p.id)}>
                      {t("postFeed.comment")}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
