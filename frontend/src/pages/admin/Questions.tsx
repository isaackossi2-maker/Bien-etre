import { useTranslation } from "react-i18next";
import Messenger from "../../components/Messenger";

export default function AdminMessages() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="page-header">
        <h1>{t("adminMessages.title")}</h1>
      </div>
      <Messenger emptyContactsLabel={t("adminMessages.emptyContacts")} />
    </div>
  );
}
