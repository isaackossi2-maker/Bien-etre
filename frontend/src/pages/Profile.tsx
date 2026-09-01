import { FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import Avatar from "../components/Avatar";
import { resizeImageToDataUrl } from "../utils/image";
import { Theme, useTheme } from "../theme/ThemeContext";

const LANGUAGE_OPTIONS: { value: "fr" | "en"; label: string; flag: string }[] = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();
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

  const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
    { value: "system", label: t("profile.themeSystem"), icon: "🖥️" },
    { value: "light", label: t("profile.themeLight"), icon: "☀️" },
    { value: "dark", label: t("profile.themeDark"), icon: "🌙" },
  ];

  const emailChanged = email !== user?.email;
  const needsCurrentPassword = emailChanged || password.length > 0;
  const avatarChanged = avatarPreview !== (user?.avatar ?? null);

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    if (!file.type.startsWith("image/")) {
      setAvatarError(t("profile.invalidImage"));
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatarPreview(dataUrl);
    } catch {
      setAvatarError(t("profile.imageError"));
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
      setSuccess(t("profile.saveSuccess"));
    } catch (err: any) {
      setError(err.response?.data?.message ?? t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t("profile.title")}</h1>
      </div>

      <div className="card" style={{ maxWidth: 480, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t("profile.appearance")}</h3>
        <div className="list-actions">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={theme === opt.value ? "btn btn-primary" : "btn btn-outline"}
              onClick={() => setTheme(opt.value)}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 480, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t("profile.language")}</h3>
        <div className="list-actions">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={i18n.language === opt.value ? "btn btn-primary" : "btn btn-outline"}
              onClick={() => i18n.changeLanguage(opt.value)}
            >
              {opt.flag} {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <Avatar name={name || user?.name} avatar={avatarPreview} size={72} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="list-actions">
              <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
                {t("profile.changePhoto")}
              </button>
              {avatarPreview && (
                <button type="button" className="btn btn-outline" onClick={() => setAvatarPreview(null)}>
                  {t("profile.remove")}
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} style={{ display: "none" }} />
            {avatarError && <span className="error-text">{avatarError}</span>}
          </div>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            {t("profile.fullName")}
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            {t("profile.email")}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            {t("profile.newPassword")}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
          </label>
          {needsCurrentPassword && (
            <label>
              {t("profile.currentPassword")}
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
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </form>
      </div>
    </div>
  );
}
