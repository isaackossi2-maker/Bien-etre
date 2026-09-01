import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { useUnreadCount } from "../hooks/useUnreadCount";
import Avatar from "../components/Avatar";
import StarLogo from "../components/StarLogo";
import QuickSettings from "../components/QuickSettings";

export default function UserLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const unreadCount = useUnreadCount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const links = [
    { to: "/app", label: t("nav.dashboard"), end: true },
    { to: "/app/meditations", label: t("nav.meditations") },
    { to: "/app/exams", label: t("nav.exams") },
    { to: "/app/questions", label: t("nav.discussions"), showUnread: true },
    { to: "/app/reunion", label: t("nav.reunion") },
    { to: "/app/bible", label: t("nav.bible") },
  ];

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <QuickSettings />
      <div className="mobile-topbar">
        <button className="hamburger-btn" aria-label="Menu" onClick={() => setMobileOpen((v) => !v)}>
          <span />
          <span />
          <span />
        </button>
        <span className="brand">
          <StarLogo size={24} />
        </span>
        <span style={{ width: 32 }} />
      </div>

      <div className={`sidebar-backdrop ${mobileOpen ? "open" : ""}`} onClick={() => setMobileOpen(false)} />

      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-brand" style={{ display: "flex", alignItems: "center" }}>
          <StarLogo size={26} />
        </div>
        <nav className="sidebar-nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => (isActive ? "active" : "")}>
              <span>{link.label}</span>
              {link.showUnread && unreadCount > 0 && <span className="badge-notify">{unreadCount}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link
            to="profile"
            className="sidebar-user"
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
          >
            <Avatar name={user?.name} avatar={user?.avatar} size={38} />
            <div>
              {user?.name}
              <small>
                {user?.email} · {t("nav.profile")}
              </small>
            </div>
          </Link>
          <button className="btn btn-outline" style={{ width: "100%" }} onClick={logout}>
            {t("nav.logout")}
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
