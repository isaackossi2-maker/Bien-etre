import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Meditation } from "../../types";

export default function UserMeditations() {
  const [meditations, setMeditations] = useState<Meditation[]>([]);
  const [selected, setSelected] = useState<Meditation | null>(null);

  useEffect(() => {
    api.get<Meditation[]>("/meditations").then((res) => setMeditations(res.data));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Méditations</h1>
      </div>

      {meditations.length === 0 ? (
        <p className="empty-state">Aucune méditation disponible pour le moment.</p>
      ) : (
        <div className="stat-grid">
          {meditations.map((m) => (
            <div
              key={m.id}
              className="card"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setSelected(m);
                api.post(`/meditations/${m.id}/view`);
              }}
            >
              <h3 style={{ marginTop: 0 }}>{m.title}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{m.description}</p>
              {m.duration && <span className="badge badge-user">{m.duration} min</span>}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="page-header">
            <h2 style={{ margin: 0 }}>{selected.title}</h2>
            <button className="btn btn-outline" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </div>
          <p>{selected.content}</p>
        </div>
      )}
    </div>
  );
}
