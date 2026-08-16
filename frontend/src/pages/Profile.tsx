import { FormEvent, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import Avatar from "../components/Avatar";
import { resizeImageToDataUrl } from "../utils/image";

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar ?? null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emailChanged = email !== user?.email;
  const needsCurrentPassword = emailChanged || password.length > 0;
  const avatarChanged = avatarPreview !== (user?.avatar ?? null);

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    if (!file.type.startsWith("image/")) {
      setAvatarError("Le fichier doit être une image.");
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatarPreview(dataUrl);
    } catch {
      setAvatarError("Impossible de traiter cette image.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await updateProfile({
        name: name !== user?.name ? name : undefined,
        email: emailChanged ? email : undefined,
        password: password || undefined,
        currentPassword: needsCurrentPassword ? currentPassword : undefined,
        avatar: avatarChanged ? avatarPreview : undefined,
      });
      setPassword("");
      setCurrentPassword("");
      setSuccess("Profil mis à jour avec succès.");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Impossible de mettre à jour le profil");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Mon profil</h1>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <Avatar name={name || user?.name} avatar={avatarPreview} size={72} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="list-actions">
              <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
                Changer la photo
              </button>
              {avatarPreview && (
                <button type="button" className="btn btn-outline" onClick={() => setAvatarPreview(null)}>
                  Retirer
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} style={{ display: "none" }} />
            {avatarError && <span className="error-text">{avatarError}</span>}
          </div>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Nom complet
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Nouveau mot de passe (laisser vide pour ne pas changer)
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
          </label>
          {needsCurrentPassword && (
            <label>
              Mot de passe actuel (requis pour changer l'email ou le mot de passe)
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
          )}
          {error && <span className="error-text">{error}</span>}
          {success && <span style={{ color: "var(--success)", fontSize: "0.85rem" }}>{success}</span>}
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}
