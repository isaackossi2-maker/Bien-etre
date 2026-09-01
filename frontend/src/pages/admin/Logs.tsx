import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { LogEntry } from "../../types";
import Avatar from "../../components/Avatar";
import { formatDateTime } from "../../utils/date";

export default function AdminLogs() {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    api.get<LogEntry[]>("/logs").then((res) => setLogs(res.data));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>{t("adminLogs.title")}</h1>
      </div>

      {logs.length === 0 ? (
        <p className="empty-state">{t("adminLogs.noLogs")}</p>
      ) : (
        <table className="table-no-lines">
          <thead>
            <tr>
              <th>{t("adminLogs.date")}</th>
              <th>{t("adminLogs.user")}</th>
              <th>{t("adminLogs.action")}</th>
              <th>{t("adminLogs.detail")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.createdAt, i18n.language)}</td>
                <td>
                  {log.user ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={log.user.name} avatar={log.user.avatar} size={26} />
                      <span>
                        {log.user.name} ({log.user.email})
                      </span>
                    </div>
                  ) : (
                    t("common.none")
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
