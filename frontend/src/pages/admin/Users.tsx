import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { User } from "../../types";
import { formatDate } from "../../utils/date";

type RoleFilter = "ALL" | "ADMIN" | "USER";

export default function AdminUsers() {
  const { t, i18n } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");

  function load() {
    api.get<User[]>("/users").then((res) => setUsers(res.data));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users", { name, email, password, role });
      setName("");
      setEmail("");
      setPassword("");
      setRole("USER");
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? t("adminUsers.createError"));
    }
  }

  async function handleDelete(id: string) {
    if (id === currentUser?.id) return;
    if (!confirm(t("adminUsers.confirmDelete"))) return;
    await api.delete(`/users/${id}`);
    load();
  }

  async function handleRoleChange(u: User, newRole: "ADMIN" | "USER") {
    if (u.id === currentUser?.id) return;
    if (newRole === u.role) return;
    const verb = newRole === "ADMIN" ? t("adminUsers.promote") : t("adminUsers.demote");
    if (!confirm(t("adminUsers.confirmRoleChange", { verb, name: u.name }))) return;
    await api.put(`/users/${u.id}`, { role: newRole });
    load();
  }

  const filteredUsers = useMemo(
    () =>
      users.filter((u) => {
        if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      }),
    [users, roleFilter, search]
  );

  return (
    <div>
      <div className="page-header">
        <h1>{t("adminUsers.title")}</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? t("common.cancel") : t("adminUsers.newUser")}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              {t("adminUsers.name")}
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              {t("adminUsers.email")}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              {t("adminUsers.password")}
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
            <label>
              {t("adminUsers.role")}
              <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "USER")}>
                <option value="USER">{t("common.user")}</option>
                <option value="ADMIN">{t("common.administrator")}</option>
              </select>
            </label>
            {error && <span className="error-text">{error}</span>}
            <button className="btn btn-primary" type="submit">
              {t("common.create")}
            </button>
          </form>
        </div>
      )}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <input
          style={{ flex: 1, minWidth: 220 }}
          placeholder={t("adminUsers.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}>
          <option value="ALL">{t("adminUsers.allRoles")}</option>
          <option value="ADMIN">{t("adminUsers.administrators")}</option>
          <option value="USER">{t("adminUsers.users")}</option>
        </select>
      </div>

      {filteredUsers.length === 0 ? (
        <p className="empty-state">{t("adminUsers.noMatch")}</p>
      ) : (
      <table>
        <thead>
          <tr>
            <th>{t("adminUsers.name")}</th>
            <th>{t("adminUsers.email")}</th>
            <th>{t("adminUsers.role")}</th>
            <th>{t("adminUsers.createdAt")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u, e.target.value as "ADMIN" | "USER")}
                    className={`badge ${u.role === "ADMIN" ? "badge-admin" : "badge-user"}`}
                    style={{ border: "none", cursor: isSelf ? "default" : "pointer" }}
                    disabled={isSelf}
                    title={isSelf ? t("adminUsers.cannotChangeSelf") : undefined}
                  >
                    <option value="USER">{t("common.user")}</option>
                    <option value="ADMIN">{t("common.admin")}</option>
                  </select>
                </td>
                <td>{u.createdAt ? formatDate(u.createdAt, i18n.language) : t("common.none")}</td>
                <td className="list-actions">
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(u.id)}
                    disabled={isSelf}
                    title={isSelf ? t("adminUsers.cannotDeleteSelf") : undefined}
                  >
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      )}
    </div>
  );
}
