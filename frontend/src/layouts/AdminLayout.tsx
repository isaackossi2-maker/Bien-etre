import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useUnreadCount } from "../hooks/useUnreadCount";
import Avatar from "../components/Avatar";
import StarLogo from "../components/StarLogo";

const links = [
  { to: "/admin", label: "Tableau de bord", end: true },
  { to: "/admin/users", label: "Utilisateurs" },
  { to: "/admin/exams", label: "Examens" },
  { to: "/admin/meditations", label: "Méditations" },
  { to: "/admin/questions", label: "Discussions", showUnread: true },
  { to: "/admin/results", label: "Notes" },
  { to: "/admin/logs", label: "Logs" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const unreadCount = useUnreadCount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
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
              <small>{user?.email} · Modifier le profil</small>
            </div>
          </Link>
          <button className="btn btn-outline" style={{ width: "100%" }} onClick={logout}>
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
