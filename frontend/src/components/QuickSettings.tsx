import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Theme, useTheme } from "../theme/ThemeContext";

const THEME_OPTIONS: { value: Theme; icon: string }[] = [
  { value: "system", icon: "🖥️" },
  { value: "light", icon: "☀️" },
  { value: "dark", icon: "🌙" },
];

const LANGUAGE_OPTIONS: { value: "fr" | "en"; label: string; flag: string }[] = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

export default function QuickSettings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const currentThemeIcon = THEME_OPTIONS.find((o) => o.value === theme)?.icon ?? "🖥️";
  const currentFlag = i18n.language === "en" ? "🇬🇧" : "🇫🇷";

  return (
    <div ref={rootRef} className="quick-settings">
      <button
        type="button"
        className="quick-settings-toggle"
        onClick={() => setOpen((v) => !v)}
        title={`${t("profile.appearance")} / ${t("profile.language")}`}
      >
        {currentThemeIcon} {currentFlag}
      </button>

      {open && (
        <div className="quick-settings-panel">
          <div>
            <span className="quick-settings-label">{t("profile.appearance")}</span>
            <div className="list-actions">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={theme === opt.value ? "btn btn-primary" : "btn btn-outline"}
                  onClick={() => setTheme(opt.value)}
                >
                  {opt.icon} {t(`profile.theme${opt.value.charAt(0).toUpperCase()}${opt.value.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="quick-settings-label">{t("profile.language")}</span>
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
        </div>
      )}
    </div>
  );
}
