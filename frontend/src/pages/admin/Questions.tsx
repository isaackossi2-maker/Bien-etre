import Messenger from "../../components/Messenger";

export default function AdminMessages() {
  return (
    <div>
      <div className="page-header">
        <h1>Discussions</h1>
      </div>
      <Messenger emptyContactsLabel="Aucun utilisateur trouvé." />
    </div>
  );
}
