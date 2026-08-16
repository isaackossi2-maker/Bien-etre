import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import { User } from "../../types";

type RoleFilter = "ALL" | "ADMIN" | "USER";

export default function AdminUsers() {
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
      setError(err.response?.data?.message ?? "Erreur lors de la création");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    await api.delete(`/users/${id}`);
    load();
  }

  async function handleRoleChange(u: User, newRole: "ADMIN" | "USER") {
    if (newRole === u.role) return;
    const verb = newRole === "ADMIN" ? "promouvoir en administrateur" : "rétrograder en utilisateur simple";
    if (!confirm(`Voulez-vous vraiment ${verb} ${u.name} ?`)) return;
    await api.put(`/users/${u.id}`, { role: newRole });
    load();
  }

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="page-header">
        <h1>Utilisateurs</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Annuler" : "Nouvel utilisateur"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              Nom
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Mot de passe
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>
            <label>
              Rôle
              <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "USER")}>
                <option value="USER">Utilisateur</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </label>
            {error && <span className="error-text">{error}</span>}
            <button className="btn btn-primary" type="submit">
              Créer
            </button>
          </form>
        </div>
      )}

      <div className="inline-form" style={{ marginBottom: 16 }}>
        <input
          style={{ flex: 1, minWidth: 220 }}
          placeholder="Rechercher par nom ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}>
          <option value="ALL">Tous les rôles</option>
          <option value="ADMIN">Administrateurs</option>
          <option value="USER">Utilisateurs</option>
        </select>
      </div>

      {filteredUsers.length === 0 ? (
        <p className="empty-state">Aucun utilisateur ne correspond à cette recherche.</p>
      ) : (
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Email</th>
            <th>Rôle</th>
            <th>Créé le</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u, e.target.value as "ADMIN" | "USER")}
                  className={`badge ${u.role === "ADMIN" ? "badge-admin" : "badge-user"}`}
                  style={{ border: "none", cursor: "pointer" }}
                >
                  <option value="USER">Utilisateur</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </td>
              <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR") : "—"}</td>
              <td className="list-actions">
                <button className="btn btn-danger" onClick={() => handleDelete(u.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}
