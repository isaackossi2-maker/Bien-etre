import PostFeed from "../../components/PostFeed";

export default function UserDashboard() {
  return (
    <div>
      <div className="page-header">
        <h1>Tableau de bord</h1>
      </div>
      <PostFeed canPublish={false} />
    </div>
  );
}
