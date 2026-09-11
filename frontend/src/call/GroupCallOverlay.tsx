import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users } from "lucide-react";
import { useCall } from "./CallContext";
import { useAuth } from "../auth/AuthContext";
import { useRingtone } from "./useRingtone";

function ParticipantTile({
  name,
  stream,
  isVideo,
  isSelf,
}: {
  name: string;
  stream: MediaStream | null;
  muted?: boolean;
  isVideo: boolean;
  isSelf?: boolean;
}) {
  const { t } = useTranslation();
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
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: hasVideoTrack ? "block" : "none" }}
      />
      {!hasVideoTrack && (
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
        {isSelf ? t("reunionRoom.youSuffix") : ""}
      </div>
    </div>
  );
}

export default function GroupCallOverlay() {
  const { t } = useTranslation();
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
    background: "var(--overlay-bg)",
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
            marginBottom: 16,
          }}
        >
          <Users size={44} />
        </div>
        <h2 style={{ margin: "0 0 4px" }}>{groupCallInfo?.groupName}</h2>
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          {groupCallInfo?.fromName} {t(groupCallInfo?.video ? "groupCallOverlay.startingVideo" : "groupCallOverlay.startingVoice")}
        </p>
        <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
          <button
            onClick={declineGroupCall}
            title={t("groupCallOverlay.decline")}
            style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: "var(--danger)", color: "#fff", fontSize: "1.4rem", cursor: "pointer" }}
          >
            ✕
          </button>
          <button
            onClick={joinGroupCall}
            title={t("groupCallOverlay.join")}
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
        <h2 style={{ margin: "0 0 2px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Users size={20} /> {groupCallInfo?.groupName}
        </h2>
        <p style={{ color: "var(--text-muted)", margin: 0 }}>{t("groupCallOverlay.participants", { count: others.length + 1 })}</p>
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
        <ParticipantTile name={user?.name ?? t("reunion.me")} stream={groupLocalStream} isVideo={groupIsVideo && !groupCameraOff} isSelf />
        {others.map((p) => (
          <ParticipantTile key={p.id} name={p.name} stream={p.stream} isVideo={groupIsVideo} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 20, marginTop: 28, alignItems: "center" }}>
        <button
          onClick={toggleGroupMute}
          title={groupMuted ? t("groupCallOverlay.enableMic") : t("groupCallOverlay.disableMic")}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: groupMuted ? "none" : "1px solid var(--border)",
            background: groupMuted ? "var(--danger)" : "var(--surface)",
            color: groupMuted ? "#fff" : "var(--text)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {groupMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        {groupIsVideo && (
          <button
            onClick={toggleGroupCamera}
            title={groupCameraOff ? t("groupCallOverlay.enableCamera") : t("groupCallOverlay.disableCamera")}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: groupCameraOff ? "none" : "1px solid var(--border)",
              background: groupCameraOff ? "var(--danger)" : "var(--surface)",
              color: groupCameraOff ? "#fff" : "var(--text)",
              fontSize: "1.1rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {groupCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
        )}
        <button
          onClick={leaveGroupCall}
          title={t("groupCallOverlay.leave")}
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "none",
            background: "var(--danger)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );
}
