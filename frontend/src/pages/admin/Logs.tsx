import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { LogEntry } from "../../types";
import Avatar from "../../components/Avatar";

export default function AdminLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    api.get<LogEntry[]>("/logs").then((res) => setLogs(res.data));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Logs</h1>
      </div>

      {logs.length === 0 ? (
        <p className="empty-state">Aucun log pour le moment.</p>
      ) : (
        <table className="table-no-lines">
          <thead>
            <tr>
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Action</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.createdAt).toLocaleString("fr-FR")}</td>
                <td>
                  {log.user ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={log.user.name} avatar={log.user.avatar} size={26} />
                      <span>
                        {log.user.name} ({log.user.email})
                      </span>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{log.action.toLowerCase()}</td>
                <td>{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
