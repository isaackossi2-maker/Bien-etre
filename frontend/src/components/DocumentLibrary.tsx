import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { LibraryDocument } from "../types";
import { resizeImageToDataUrl } from "../utils/image";

interface DocumentLibraryProps {
  editable?: boolean;
}

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

// Le téléchargement n'est possible que si l'admin l'a activé ET que la date courante tombe
// dans la fenêtre définie (une borne vide = pas de restriction de ce côté). Reflète exactement
// la même règle appliquée côté serveur (voir backend/src/routes/documents.ts).
function isDownloadAllowed(doc: LibraryDocument): boolean {
  if (!doc.downloadEnabled) return false;
  const now = new Date();
  if (doc.downloadStartAt && now < new Date(doc.downloadStartAt)) return false;
  if (doc.downloadEndAt && now > new Date(doc.downloadEndAt)) return false;
  return true;
}

// <input type="datetime-local"> attend "YYYY-MM-DDTHH:mm" en heure locale, sans "Z".
function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DocumentLibrary({ editable = false }: DocumentLibraryProps) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [downloadStartAt, setDownloadStartAt] = useState("");
  const [downloadEndAt, setDownloadEndAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [viewerDoc, setViewerDoc] = useState<LibraryDocument | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEnabled, setEditEnabled] = useState(false);
  const [editStartAt, setEditStartAt] = useState("");
  const [editEndAt, setEditEndAt] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  function load() {
    api.get<LibraryDocument[]>("/documents").then((res) => setDocuments(res.data));
  }

  useEffect(load, []);

  async function openDocument(doc: LibraryDocument) {
    setViewerDoc(doc);
    setViewerLoading(true);
    setViewerError(null);
    setViewerUrl(null);
    try {
      const res = await api.get(`/documents/${doc.id}/file`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: doc.fileMimeType });
      setViewerUrl(URL.createObjectURL(blob));
    } catch {
      setViewerError(t("documentLibrary.openError"));
    } finally {
      setViewerLoading(false);
    }
  }

  function closeViewer() {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl);
    setViewerUrl(null);
    setViewerDoc(null);
    setViewerError(null);
  }

  async function handleDownload(doc: LibraryDocument) {
    setDownloadingId(doc.id);
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: doc.fileMimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.originalFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert(t("documentLibrary.downloadError"));
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!coverFile || !pdfFile) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const coverData = await resizeImageToDataUrl(coverFile, 500, 0.85);
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("coverData", coverData);
      formData.append("file", pdfFile);
      formData.append("downloadEnabled", String(downloadEnabled));
      if (downloadEnabled && downloadStartAt) formData.append("downloadStartAt", new Date(downloadStartAt).toISOString());
      if (downloadEnabled && downloadEndAt) formData.append("downloadEndAt", new Date(downloadEndAt).toISOString());
      await api.post("/documents", formData);
      setTitle("");
      setDescription("");
      setCoverFile(null);
      setPdfFile(null);
      setDownloadEnabled(false);
      setDownloadStartAt("");
      setDownloadEndAt("");
      setShowForm(false);
      load();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? t("documentLibrary.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("documentLibrary.confirmDelete"))) return;
    await api.delete(`/documents/${id}`);
    load();
  }

  function startEditDownload(doc: LibraryDocument) {
    setEditingId(doc.id);
    setEditEnabled(doc.downloadEnabled);
    setEditStartAt(toDatetimeLocal(doc.downloadStartAt));
    setEditEndAt(toDatetimeLocal(doc.downloadEndAt));
  }

  async function saveEditDownload(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    try {
      await api.put(`/documents/${editingId}/download-settings`, {
        downloadEnabled: editEnabled,
        downloadStartAt: editEnabled && editStartAt ? new Date(editStartAt).toISOString() : null,
        downloadEndAt: editEnabled && editEndAt ? new Date(editEndAt).toISOString() : null,
      });
      setEditingId(null);
      load();
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="page-header" style={{ marginBottom: showForm ? 16 : documents.length ? 16 : 0 }}>
        <h3 style={{ margin: 0 }}>{t("documentLibrary.title")}</h3>
        {editable && (
          <button className="btn btn-outline" onClick={() => setShowForm((v) => !v)}>
            {showForm ? t("common.cancel") : t("documentLibrary.add")}
          </button>
        )}
      </div>

      {showForm && (
        <form className="form-grid" style={{ marginBottom: 20 }} onSubmit={handleSubmit}>
          <label>
            {t("documentLibrary.docTitle")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            {t("documentLibrary.description")}
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </label>
          <label>
            {t("documentLibrary.cover")}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label>
            {t("documentLibrary.pdfFile")}
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={downloadEnabled} onChange={(e) => setDownloadEnabled(e.target.checked)} />
            {t("documentLibrary.allowDownload")}
          </label>
          {downloadEnabled && (
            <>
              <label>
                {t("documentLibrary.downloadFrom")}
                <input type="datetime-local" value={downloadStartAt} onChange={(e) => setDownloadStartAt(e.target.value)} />
              </label>
              <label>
                {t("documentLibrary.downloadUntil")}
                <input type="datetime-local" value={downloadEndAt} onChange={(e) => setDownloadEndAt(e.target.value)} />
              </label>
              <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>{t("documentLibrary.downloadDatesHint")}</p>
            </>
          )}
          {formError && <span className="error-text">{formError}</span>}
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? t("common.saving") : t("common.create")}
          </button>
        </form>
      )}

      {documents.length === 0 ? (
        <p className="empty-state">{t("documentLibrary.noDocuments")}</p>
      ) : (
        <div className="document-grid">
          {documents.map((doc) => {
            const downloadable = isDownloadAllowed(doc);
            return (
              <div key={doc.id} className="card" style={{ padding: 8 }}>
                <div
                  onClick={() => openDocument(doc)}
                  style={{
                    cursor: "pointer",
                    aspectRatio: "3 / 4",
                    borderRadius: 6,
                    overflow: "hidden",
                    background: "var(--surface-muted)",
                    marginBottom: 8,
                  }}
                >
                  <img
                    src={doc.coverData}
                    alt={doc.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>
                <h4
                  style={{ margin: "0 0 4px", fontSize: "0.85rem", cursor: "pointer" }}
                  onClick={() => openDocument(doc)}
                >
                  {doc.title}
                </h4>
                {editable && (
                  <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{formatFileSize(doc.fileSize)}</span>
                )}

                {downloadable && (
                  <button
                    className="btn btn-outline"
                    style={{ width: "100%", marginTop: 6, padding: "4px 0", fontSize: "0.75rem" }}
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                  >
                    {downloadingId === doc.id ? t("common.loading") : t("documentLibrary.download")}
                  </button>
                )}

                {editable && (
                  <>
                    <button
                      className="btn btn-outline"
                      style={{ width: "100%", marginTop: 6, padding: "4px 0", fontSize: "0.75rem" }}
                      onClick={() => startEditDownload(doc)}
                    >
                      {doc.downloadEnabled ? t("documentLibrary.downloadEnabledBadge") : t("documentLibrary.manageDownload")}
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ width: "100%", marginTop: 6, padding: "4px 0", fontSize: "0.75rem" }}
                      onClick={() => handleDelete(doc.id)}
                    >
                      {t("common.delete")}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-bg)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <form className="card form-grid" style={{ width: "min(360px, 100%)" }} onSubmit={saveEditDownload}>
            <div className="page-header" style={{ marginBottom: 0 }}>
              <h3 style={{ margin: 0 }}>{t("documentLibrary.manageDownload")}</h3>
              <button type="button" className="btn btn-outline" onClick={() => setEditingId(null)}>
                {t("common.close")}
              </button>
            </div>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={editEnabled} onChange={(e) => setEditEnabled(e.target.checked)} />
              {t("documentLibrary.allowDownload")}
            </label>
            {editEnabled && (
              <>
                <label>
                  {t("documentLibrary.downloadFrom")}
                  <input type="datetime-local" value={editStartAt} onChange={(e) => setEditStartAt(e.target.value)} />
                </label>
                <label>
                  {t("documentLibrary.downloadUntil")}
                  <input type="datetime-local" value={editEndAt} onChange={(e) => setEditEndAt(e.target.value)} />
                </label>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>{t("documentLibrary.downloadDatesHint")}</p>
              </>
            )}
            <button className="btn btn-primary" type="submit" disabled={editSaving}>
              {editSaving ? t("common.saving") : t("common.save")}
            </button>
          </form>
        </div>
      )}

      {viewerDoc && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-bg)",
            zIndex: 3000,
            display: "flex",
            flexDirection: "column",
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{viewerDoc.title}</h3>
            <div className="list-actions">
              {isDownloadAllowed(viewerDoc) && (
                <button className="btn btn-outline" onClick={() => handleDownload(viewerDoc)} disabled={downloadingId === viewerDoc.id}>
                  {downloadingId === viewerDoc.id ? t("common.loading") : t("documentLibrary.download")}
                </button>
              )}
              <button className="btn btn-outline" onClick={closeViewer}>
                {t("common.close")}
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, background: "var(--surface)", borderRadius: 8, overflow: "hidden" }}>
            {viewerLoading && <p className="empty-state">{t("documentLibrary.loadingFile")}</p>}
            {viewerError && <p className="error-text">{viewerError}</p>}
            {viewerUrl && <iframe src={viewerUrl} title={viewerDoc.title} style={{ width: "100%", height: "100%", border: "none" }} />}
          </div>
        </div>
      )}
    </div>
  );
}
