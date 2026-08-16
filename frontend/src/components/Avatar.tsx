export default function Avatar({
  name,
  avatar,
  size = 36,
}: {
  name?: string | null;
  avatar?: string | null;
  size?: number;
}) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name ?? ""}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--primary)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.max(11, Math.round(size * 0.42)),
        flexShrink: 0,
      }}
    >
      {name?.charAt(0).toUpperCase() ?? "?"}
    </div>
  );
}
