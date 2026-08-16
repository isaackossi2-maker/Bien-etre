import { useEffect, useRef } from "react";
import { useCall } from "./CallContext";
import { useAuth } from "../auth/AuthContext";

function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    function beep() {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 700;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.stop(ctx.currentTime + 0.4);
    }

    beep();
    const interval = window.setInterval(beep, 1500);
    return () => {
      window.clearInterval(interval);
      ctx.close();
    };
  }, [active]);
}

function ParticipantTile({
  name,
  stream,
  muted,
  isVideo,
  isSelf,
}: {
  name: string;
  stream: MediaStream | null;
  muted?: boolean;
  isVideo: boolean;
  isSelf?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const hasVideoTrack = isVideo && !!stream?.getVideoTracks().some((t) => t.enabled);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "4 / 3",
        borderRadius: 12,
        overflow: "hidden",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {hasVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--primary)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.4rem",
            fontWeight: 700,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          padding: "2px 10px",
          borderRadius: 999,
          fontSize: "0.8rem",
        }}
      >
        {name}
        {isSelf ? " (moi)" : ""}
      </div>
    </div>
  );
}

export default function GroupCallOverlay() {
  const { user } = useAuth();
  const {
    groupCallStatus,
    groupCallInfo,
    groupIsVideo,
    groupParticipants,
    groupLocalStream,
    groupMuted,
    groupCameraOff,
    joinGroupCall,
    declineGroupCall,
    leaveGroupCall,
    toggleGroupMute,
    toggleGroupCamera,
  } = useCall();

  useRingtone(groupCallStatus === "incoming");

  if (groupCallStatus === "idle") return null;

  const overlayBase: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(245, 246, 250, 0.97)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
    color: "var(--text)",
    padding: 16,
    textAlign: "center",
  };

  if (groupCallStatus === "incoming") {
    return (
      <div style={overlayBase}>
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: "50%",
            background: "var(--primary)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2.2rem",
            fontWeight: 700,
            marginBottom: 16,
          }}
        >
          👥
        </div>
        <h2 style={{ margin: "0 0 4px" }}>{groupCallInfo?.groupName}</h2>
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          {groupCallInfo?.fromName} démarre un appel {groupCallInfo?.video ? "vidéo" : "vocal"} de groupe...
        </p>
        <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
          <button
            onClick={declineGroupCall}
            title="Ignorer"
            style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: "var(--danger)", color: "#fff", fontSize: "1.4rem", cursor: "pointer" }}
          >
            ✕
          </button>
          <button
            onClick={joinGroupCall}
            title="Rejoindre"
            style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: "var(--success)", color: "#fff", fontSize: "1.4rem", cursor: "pointer" }}
          >
            ✓
          </button>
        </div>
      </div>
    );
  }

  // active
  const others = groupParticipants;
  const tileCount = others.length + 1;
  const columns = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : 3;

  return (
    <div style={overlayBase}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: "0 0 2px" }}>👥 {groupCallInfo?.groupName}</h2>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>{others.length + 1} participant(s)</p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(140px, 220px))`,
          gap: 12,
          maxWidth: "min(820px, 92vw)",
          maxHeight: "60vh",
          overflowY: "auto",
        }}
      >
        <ParticipantTile name={user?.name ?? "Moi"} stream={groupLocalStream} isVideo={groupIsVideo && !groupCameraOff} isSelf />
        {others.map((p) => (
          <ParticipantTile key={p.id} name={p.name} stream={p.stream} isVideo={groupIsVideo} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 20, marginTop: 28, alignItems: "center" }}>
        <button
          onClick={toggleGroupMute}
          title={groupMuted ? "Réactiver le micro" : "Couper le micro"}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: groupMuted ? "none" : "1px solid var(--border)",
            background: groupMuted ? "var(--danger)" : "#fff",
            color: groupMuted ? "#fff" : "var(--text)",
            fontSize: "1.1rem",
            cursor: "pointer",
          }}
        >
          {groupMuted ? "🔇" : "🎙️"}
        </button>
        {groupIsVideo && (
          <button
            onClick={toggleGroupCamera}
            title={groupCameraOff ? "Réactiver la caméra" : "Couper la caméra"}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: groupCameraOff ? "none" : "1px solid var(--border)",
              background: groupCameraOff ? "var(--danger)" : "#fff",
              color: groupCameraOff ? "#fff" : "var(--text)",
              fontSize: "1.1rem",
              cursor: "pointer",
            }}
          >
            {groupCameraOff ? "📷" : "🎥"}
          </button>
        )}
        <button
          onClick={leaveGroupCall}
          title="Quitter l'appel"
          style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: "var(--danger)", color: "#fff", fontSize: "1.4rem", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
