import { useTranslation } from "react-i18next";
import Messenger from "../../components/Messenger";

export default function UserMessages() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="page-header">
        <h1>{t("userMessages.title")}</h1>
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: -12 }}>{t("userMessages.subtitle")}</p>
      <Messenger emptyContactsLabel={t("userMessages.emptyContacts")} />
    </div>
  );
}
