import { useTranslation } from "react-i18next";
import PostFeed from "../../components/PostFeed";

export default function UserDashboard() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="page-header">
        <h1>{t("userDashboard.title")}</h1>
      </div>
      <PostFeed canPublish={false} />
    </div>
  );
}
