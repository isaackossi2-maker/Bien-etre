import Messenger from "../../components/Messenger";

export default function UserMessages() {
  return (
    <div>
      <div className="page-header">
        <h1>Discussions</h1>
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: -12 }}>
        Choisissez un administrateur pour lui poser vos questions.
      </p>
      <Messenger emptyContactsLabel="Aucun administrateur disponible." />
    </div>
  );
}
