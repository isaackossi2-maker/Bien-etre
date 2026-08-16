import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCall } from "../call/CallContext";
import { DirectoryUser, GroupMessage, GroupSummary, Message, MessageContact } from "../types";
import { resizeImageToDataUrl } from "../utils/image";
import Avatar from "./Avatar";
import MicBadge from "./icons/MicBadge";
import PhoneCallIcon from "./icons/PhoneCallIcon";
import VideoCallIcon from "./icons/VideoCallIcon";

const MAX_RECORD_SECONDS = 120;

const EMOJIS = [
  "😀", "😂", "🤣", "😊", "🙂", "😉", "😍", "🥰", "😘", "😎",
  "🤔", "😴", "😅", "😢", "😭", "😡", "🥳", "🤗", "👋", "👍",
  "👎", "🙏", "👏", "💪", "🙌", "❤️", "🔥", "💯", "🎉", "✅",
];

type Selected =
  | { kind: "user"; id: string; name: string; avatar?: string | null }
  | { kind: "group"; id: string; name: string; avatar?: string | null; memberCount: number };

type ChatMessage = Message | GroupMessage;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((c) => MediaRecorder.isTypeSupported?.(c));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Messenger({ emptyContactsLabel }: { emptyContactsLabel: string }) {
  const { user } = useAuth();
  const { startCall, status: callStatus, startGroupCall, groupCallStatus } = useCall();
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [sendingFile, setSendingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [showNewDiscussion, setShowNewDiscussion] = useState(false);
  const [newDiscussionTab, setNewDiscussionTab] = useState<"direct" | "group">("direct");
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [groupAvatarError, setGroupAvatarError] = useState<string | null>(null);
  const [savingGroupAvatar, setSavingGroupAvatar] = useState(false);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const groupHeaderAvatarInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const recordSecondsRef = useRef(0);

  function loadContacts() {
    api.get<MessageContact[]>("/messages/contacts").then((res) => setContacts(res.data));
  }

  function loadGroups() {
    api.get<GroupSummary[]>("/groups").then((res) => setGroups(res.data));
  }

  function loadMessages(target: Selected) {
    const req =
      target.kind === "user"
        ? api.get<Message[]>(`/messages/thread/${target.id}`)
        : api.get<GroupMessage[]>(`/groups/${target.id}/messages`);
    req.then((res) => {
      setMessages(res.data);
      if (target.kind === "user") {
        // Le backend marque les messages comme lus à la lecture du fil : on rafraîchit les compteurs.
        loadContacts();
      }
    });
  }

  useEffect(() => {
    loadContacts();
    loadGroups();
    const interval = setInterval(() => {
      loadContacts();
      loadGroups();
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setShowEmojiPicker(false);
    if (!selected) return;
    loadMessages(selected);
    const interval = setInterval(() => loadMessages(selected), 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  function sendEndpoint(target: Selected) {
    return target.kind === "user" ? `/messages/thread/${target.id}` : `/groups/${target.id}/messages`;
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selected || !content.trim()) return;
    await api.post(sendEndpoint(selected), { content });
    setContent("");
    loadMessages(selected);
    if (selected.kind === "group") loadGroups();
  }

  async function handleAttachmentSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected) return;
    setFileError(null);
    if (file.size > 8 * 1024 * 1024) {
      setFileError("Le fichier est trop volumineux (8 Mo maximum).");
      return;
    }
    setSendingFile(true);
    try {
      const fileData = await blobToDataUrl(file);
      await api.post(sendEndpoint(selected), { fileData, fileName: file.name, fileMimeType: file.type || "application/octet-stream" });
      loadMessages(selected);
      if (selected.kind === "group") loadGroups();
    } catch {
      setFileError("Impossible d'envoyer ce fichier.");
    } finally {
      setSendingFile(false);
    }
  }

  async function startRecording() {
    setMicError(null);
    if (window.isSecureContext === false) {
      setMicError(
        "Le micro nécessite une connexion sécurisée (HTTPS). Cette page est chargée en HTTP simple depuis une adresse autre que localhost, donc le navigateur bloque l'accès au micro."
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicError("L'enregistrement audio n'est pas pris en charge par ce navigateur.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        if (cancelledRef.current || !selected) {
          setRecording(false);
          setRecordSeconds(0);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
        const duration = recordSecondsRef.current;
        setRecording(false);
        setSendingAudio(true);
        try {
          const audioData = await blobToDataUrl(blob);
          await api.post(sendEndpoint(selected), { audioData, audioDuration: duration });
          loadMessages(selected);
          if (selected.kind === "group") loadGroups();
        } finally {
          setSendingAudio(false);
          setRecordSeconds(0);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      recordSecondsRef.current = 0;
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
        if (recordSecondsRef.current >= MAX_RECORD_SECONDS) {
          mediaRecorderRef.current?.stop();
        }
      }, 1000);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      console.error("Erreur d'accès au micro:", err);
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMicError(
          "Accès au micro refusé. Autorisez le micro pour ce site dans les paramètres du navigateur (cliquez sur l'icône de cadenas/micro dans la barre d'adresse), puis réessayez."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setMicError("Aucun micro détecté sur cet appareil.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setMicError("Le micro est déjà utilisé par une autre application.");
      } else {
        setMicError(`Impossible d'accéder au micro${name ? ` (${name})` : ""}.`);
      }
    }
  }

  function stopRecording() {
    cancelledRef.current = false;
    mediaRecorderRef.current?.stop();
  }

  function cancelRecording() {
    cancelledRef.current = true;
    mediaRecorderRef.current?.stop();
  }

  function openNewDiscussion() {
    setNewDiscussionTab("direct");
    setGroupName("");
    setGroupMemberIds([]);
    setShowNewDiscussion(true);
    if (directory.length === 0) {
      api.get<DirectoryUser[]>("/groups/directory").then((res) => setDirectory(res.data));
    }
  }

  function toggleGroupMember(id: string) {
    setGroupMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  async function handleCreateGroup() {
    if (!groupName.trim() || groupMemberIds.length === 0) return;
    setCreatingGroup(true);
    try {
      const { data } = await api.post<GroupSummary>("/groups", {
        name: groupName,
        memberIds: groupMemberIds,
        avatar: groupAvatar,
      });
      loadGroups();
      setShowNewDiscussion(false);
      setSelected({ kind: "group", id: data.id, name: data.name, avatar: data.avatar, memberCount: data.memberCount });
      setGroupName("");
      setGroupMemberIds([]);
      setGroupAvatar(null);
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleGroupAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setGroupAvatarError(null);
    if (!file.type.startsWith("image/")) {
      setGroupAvatarError("Le fichier doit être une image.");
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setGroupAvatar(dataUrl);
    } catch {
      setGroupAvatarError("Impossible de traiter cette image.");
    }
  }

  async function handleGroupHeaderAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected || selected.kind !== "group") return;
    if (!file.type.startsWith("image/")) return;
    setSavingGroupAvatar(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await api.patch(`/groups/${selected.id}`, { avatar: dataUrl });
      setSelected({ ...selected, avatar: dataUrl });
      loadGroups();
    } finally {
      setSavingGroupAvatar(false);
    }
  }

  const filteredContacts = contacts.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  const filteredGroups = groups.filter((g) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return g.name.toLowerCase().includes(q);
  });

  const newDiscussionModal = showNewDiscussion && (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1500,
      }}
      onClick={() => setShowNewDiscussion(false)}
    >
      <div
        className="card"
        style={{ width: "min(480px, 92vw)", maxHeight: "80vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Nouvelle discussion</h2>
          <button className="btn btn-outline" onClick={() => setShowNewDiscussion(false)}>
            Fermer
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            className={`btn ${newDiscussionTab === "direct" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setNewDiscussionTab("direct")}
          >
            Message direct
          </button>
          <button
            className={`btn ${newDiscussionTab === "group" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setNewDiscussionTab("group")}
          >
            Créer un groupe
          </button>
        </div>

        {newDiscussionTab === "direct" ? (
          <div>
            {directory.length === 0 ? (
              <p className="empty-state">Aucun utilisateur disponible.</p>
            ) : (
              directory.map((u) => (
                <div
                  key={u.id}
                  onClick={() => {
                    setSelected({ kind: "user", id: u.id, name: u.name, avatar: u.avatar });
                    setShowNewDiscussion(false);
                  }}
                  style={{
                    padding: "10px 4px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Avatar name={u.name} avatar={u.avatar} size={32} />
                  {u.name}{" "}
                  <span className={`badge ${u.role === "ADMIN" ? "badge-admin" : "badge-user"}`}>
                    {u.role === "ADMIN" ? "Admin" : "Utilisateur"}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="form-grid" style={{ maxWidth: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Avatar name={groupName || "?"} avatar={groupAvatar} size={56} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="list-actions">
                  <button type="button" className="btn btn-outline" onClick={() => groupAvatarInputRef.current?.click()}>
                    Photo du groupe
                  </button>
                  {groupAvatar && (
                    <button type="button" className="btn btn-outline" onClick={() => setGroupAvatar(null)}>
                      Retirer
                    </button>
                  )}
                </div>
                <input
                  ref={groupAvatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleGroupAvatarSelect}
                  style={{ display: "none" }}
                />
                {groupAvatarError && <span className="error-text">{groupAvatarError}</span>}
              </div>
            </div>
            <label>
              Nom du groupe
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} required />
            </label>
            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Membres</span>
              <div
                style={{
                  marginTop: 6,
                  maxHeight: 220,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                {directory.map((u) => (
                  <label key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: "4px 0" }}>
                    <input
                      type="checkbox"
                      checked={groupMemberIds.includes(u.id)}
                      onChange={() => toggleGroupMember(u.id)}
                    />
                    <Avatar name={u.name} avatar={u.avatar} size={26} />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
            <button
              className="btn btn-primary"
              disabled={creatingGroup || !groupName.trim() || groupMemberIds.length === 0}
              onClick={handleCreateGroup}
            >
              {creatingGroup ? "Création..." : "Créer le groupe"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (!selected) {
    return (
      <div className="messenger-container">
        <div className="card messenger-list" style={{ width: "100%", display: "flex", flexDirection: "column", padding: 0 }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={openNewDiscussion} style={{ whiteSpace: "nowrap" }}>
              + Nouvelle discussion
            </button>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filteredGroups.length > 0 && (
              <>
                <div style={{ padding: "8px 16px", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  Groupes
                </div>
                {filteredGroups.map((g) => (
                  <div
                    key={g.id}
                    onClick={() => setSelected({ kind: "group", id: g.id, name: g.name, avatar: g.avatar, memberCount: g.memberCount })}
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Avatar name={g.name} avatar={g.avatar} size={38} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{g.name}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{g.memberCount} membres</div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {filteredContacts.length > 0 && (
              <div style={{ padding: "8px 16px", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Utilisateurs
              </div>
            )}
            {filteredContacts.length === 0 && filteredGroups.length === 0 ? (
              <p className="empty-state" style={{ padding: 16 }}>
                {emptyContactsLabel}
              </p>
            ) : (
              filteredContacts.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelected({ kind: "user", id: c.id, name: c.name, avatar: c.avatar })}
                  style={{
                    padding: "12px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Avatar name={c.name} avatar={c.avatar} size={38} />
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    {c.unreadCount > 0 && <span className="badge-notify">{c.unreadCount}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {newDiscussionModal}
      </div>
    );
  }

  return (
    <div className="messenger-container">
      <div className="card messenger-chat" style={{ width: "100%", display: "flex", flexDirection: "column", padding: 0 }}>
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setSelected(null)}
              title="Retour"
              style={{ padding: "4px 10px" }}
            >
              ←
            </button>
            {selected.kind === "user" && <Avatar name={selected.name} avatar={selected.avatar} size={34} />}
            {selected.kind === "group" && (
              <div
                onClick={() => groupHeaderAvatarInputRef.current?.click()}
                title="Changer la photo du groupe"
                style={{ cursor: "pointer", position: "relative", opacity: savingGroupAvatar ? 0.5 : 1 }}
              >
                <Avatar name={selected.name} avatar={selected.avatar} size={34} />
                <input
                  ref={groupHeaderAvatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleGroupHeaderAvatarSelect}
                  style={{ display: "none" }}
                />
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600 }}>{selected.name}</div>
              {selected.kind === "group" && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{selected.memberCount} membres</div>
              )}
            </div>
          </div>
          {selected.kind === "user" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-outline"
                title="Appel vocal"
                disabled={callStatus !== "idle"}
                onClick={() => startCall({ id: selected.id, name: selected.name }, false)}
                style={{ padding: "6px 10px", display: "flex", alignItems: "center" }}
              >
                <PhoneCallIcon size={18} />
              </button>
              <button
                type="button"
                className="btn btn-outline"
                title="Appel vidéo"
                disabled={callStatus !== "idle"}
                onClick={() => startCall({ id: selected.id, name: selected.name }, true)}
                style={{ padding: "6px 10px", display: "flex", alignItems: "center" }}
              >
                <VideoCallIcon size={18} />
              </button>
            </div>
          )}
          {selected.kind === "group" && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-outline"
                title="Appel vocal de groupe"
                disabled={groupCallStatus !== "idle" || callStatus !== "idle"}
                onClick={() => startGroupCall(selected.id, selected.name, false)}
                style={{ padding: "6px 10px", display: "flex", alignItems: "center" }}
              >
                <PhoneCallIcon size={18} />
              </button>
              <button
                type="button"
                className="btn btn-outline"
                title="Appel vidéo de groupe"
                disabled={groupCallStatus !== "idle" || callStatus !== "idle"}
                onClick={() => startGroupCall(selected.id, selected.name, true)}
                style={{ padding: "6px 10px", display: "flex", alignItems: "center" }}
              >
                <VideoCallIcon size={18} />
              </button>
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((m) => {
            const isMine = m.senderId === user?.id;
            return (
              <div key={m.id} style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                {selected.kind === "group" && !isMine && (
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 2 }}>{m.sender.name}</div>
                )}
                {m.type === "AUDIO" ? (
                  <div
                    style={{
                      background: isMine ? "var(--primary)" : "#eef0f4",
                      borderRadius: 12,
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <MicBadge size={28} />
                    <audio controls src={m.audioData ?? undefined} style={{ width: 220, maxWidth: "100%" }} />
                    {m.audioDuration != null && (
                      <span style={{ fontSize: "0.72rem", color: isMine ? "#eef0ff" : "var(--text-muted)" }}>
                        {formatDuration(m.audioDuration)}
                      </span>
                    )}
                  </div>
                ) : m.type === "FILE" ? (
                  m.fileMimeType?.startsWith("image/") ? (
                    <a href={m.fileData ?? undefined} target="_blank" rel="noreferrer">
                      <img
                        src={m.fileData ?? undefined}
                        alt={m.fileName ?? "image"}
                        style={{ maxWidth: 240, maxHeight: 240, borderRadius: 12, display: "block", objectFit: "cover" }}
                      />
                    </a>
                  ) : (
                    <a
                      href={m.fileData ?? undefined}
                      download={m.fileName ?? "fichier"}
                      style={{
                        background: isMine ? "var(--primary)" : "#eef0f4",
                        color: isMine ? "#fff" : "var(--text)",
                        borderRadius: 12,
                        padding: "8px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        textDecoration: "none",
                        maxWidth: 240,
                      }}
                    >
                      <span style={{ fontSize: "1.3rem" }}>📎</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.fileName ?? "Fichier"}
                      </span>
                    </a>
                  )
                ) : (
                  <div
                    style={{
                      background: isMine ? "var(--primary)" : "#eef0f4",
                      color: isMine ? "#fff" : "var(--text)",
                      borderRadius: 12,
                      padding: "8px 12px",
                    }}
                  >
                    {m.content}
                  </div>
                )}
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                  {isMine ? "Vous" : selected.kind === "group" ? "" : m.sender.name}{" "}
                  {isMine || selected.kind !== "group" ? "— " : ""}
                  {new Date(m.createdAt).toLocaleString("fr-FR")}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {micError && (
          <p className="error-text" style={{ padding: "0 12px", margin: "8px 0 0" }}>
            {micError}
          </p>
        )}
        {fileError && (
          <p className="error-text" style={{ padding: "0 12px", margin: "8px 0 0" }}>
            {fileError}
          </p>
        )}
        {sendingFile && (
          <p style={{ padding: "0 12px", margin: "8px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Envoi du fichier...
          </p>
        )}

        {recording ? (
          <div className="inline-form" style={{ padding: 12, borderTop: "1px solid var(--border)", alignItems: "center" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--danger)",
                display: "inline-block",
              }}
            />
            <span style={{ flex: 1 }}>Enregistrement... {formatDuration(recordSeconds)}</span>
            <button type="button" className="btn btn-outline" onClick={cancelRecording}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={stopRecording}>
              Envoyer
            </button>
          </div>
        ) : (
          <div style={{ position: "relative", padding: 12, borderTop: "1px solid var(--border)" }}>
            {showEmojiPicker && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: 12,
                  marginBottom: 8,
                  background: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 10,
                  display: "grid",
                  gridTemplateColumns: "repeat(6, 1fr)",
                  gap: 4,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  zIndex: 10,
                }}
              >
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setContent((c) => c + emoji)}
                    style={{
                      border: "none",
                      background: "transparent",
                      fontSize: "1.3rem",
                      cursor: "pointer",
                      padding: 4,
                      borderRadius: 6,
                      lineHeight: 1,
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={handleSend}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "6px 8px 6px 16px",
              }}
            >
              <button
                type="button"
                title="Joindre un fichier"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={sendingFile}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: sendingFile ? "default" : "pointer",
                  color: "var(--text-muted)",
                  fontSize: "1.3rem",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                +
              </button>
              <input
                ref={attachmentInputRef}
                type="file"
                onChange={handleAttachmentSelect}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                🙂
              </button>
              <input
                style={{ flex: 1, border: "none", outline: "none", background: "transparent" }}
                placeholder="Entrez un message"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onFocus={() => setShowEmojiPicker(false)}
                disabled={sendingAudio}
              />
              {content.trim() ? (
                <button
                  type="submit"
                  disabled={sendingAudio}
                  title="Envoyer"
                  style={{
                    border: "none",
                    background: "var(--primary)",
                    color: "#fff",
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1rem",
                    flexShrink: 0,
                  }}
                >
                  ➤
                </button>
              ) : (
                <button
                  type="button"
                  title="Message vocal"
                  onClick={startRecording}
                  disabled={sendingAudio}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  {sendingAudio ? "..." : <MicBadge size={26} />}
                </button>
              )}
            </form>
          </div>
        )}
      </div>
      {newDiscussionModal}
    </div>
  );
}
