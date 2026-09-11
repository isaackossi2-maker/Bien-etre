import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { useCall } from "./CallContext";
import { useAuth } from "../auth/AuthContext";
import { useRingtone } from "./useRingtone";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CallOverlay() {
  const { t } = useTranslation();
  const { status, peer, isVideo, error, errorKey, duration, localStream, remoteStream, muted, cameraOff, acceptCall, hangUp, toggleMute, toggleCamera } =
    useCall();
  const { user } = useAuth();
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useRingtone(status === "incoming");

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (error) {
      setDismissedError(null);
      const timer = window.setTimeout(() => setDismissedError(error), 4000);
      return () => window.clearTimeout(timer);
    }
    // errorKey change à chaque nouvelle erreur même si le message est identique au précédent
    // (voir CallContext) : c'est lui le signal de "nouvel évènement", pas la valeur de error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorKey]);

  if (status === "idle") {
    if (error && error !== dismissedError) {
      return (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            padding: "12px 18px",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            zIndex: 1000,
          }}
        >
          {error}
        </div>
      );
    }
    return null;
  }

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

  const avatar = (
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
      {peer?.name?.charAt(0).toUpperCase() ?? "?"}
    </div>
  );

  if (status === "incoming") {
    return (
      <div style={overlayBase}>
        {avatar}
        <h2 style={{ margin: "0 0 4px" }}>{peer?.name}</h2>
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          {isVideo ? t("callOverlay.incomingVideo") : t("callOverlay.incomingVoice")}
        </p>
        <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
          <button
            onClick={hangUp}
            title={t("callOverlay.decline")}
            style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: "var(--danger)", color: "#fff", fontSize: "1.4rem", cursor: "pointer" }}
          >
            ✕
          </button>
          <button
            onClick={acceptCall}
            title={t("callOverlay.accept")}
            style={{ width: 56, height: 56, borderRadius: "50%", border: "none", background: "var(--success)", color: "#fff", fontSize: "1.4rem", cursor: "pointer" }}
          >
            ✓
          </button>
        </div>
      </div>
    );
  }

  // outgoing, connecting, active
  const statusLabel =
    status === "outgoing" ? t("callOverlay.ongoing") : status === "connecting" ? t("callOverlay.connecting") : formatDuration(duration);

  const showVideo = isVideo && status === "active";

  return (
    <div style={overlayBase}>
      {showVideo ? (
        <div style={{ position: "relative", width: "min(720px, 90vw)", height: "min(480px, 70vh)" }}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 16, background: "#000" }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 12,
              right: 12,
              width: "clamp(80px, 28vw, 140px)",
              height: "clamp(60px, 20vw, 100px)",
              borderRadius: 10,
              border: "2px solid #fff",
              background: "#000",
              overflow: "hidden",
            }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: cameraOff ? "none" : "block",
              }}
            />
            {cameraOff && (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--primary)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "1.4rem",
                }}
              >
                {user?.name?.charAt(0).toUpperCase() ?? "?"}
              </div>
            )}
          </div>
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              background: "rgba(255,255,255,0.9)",
              color: "var(--text)",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: "0.9rem",
            }}
          >
            {peer?.name} — {statusLabel}
          </div>
        </div>
      ) : (
        <>
          {avatar}
          <h2 style={{ margin: "0 0 4px" }}>{peer?.name}</h2>
          <p style={{ color: "var(--text-muted)", marginTop: 0 }}>{statusLabel}</p>
          <audio ref={remoteAudioRef} autoPlay />
        </>
      )}

      <div style={{ display: "flex", gap: 20, marginTop: 28, alignItems: "center" }}>
        <button
          onClick={toggleMute}
          title={muted ? t("callOverlay.enableMic") : t("callOverlay.disableMic")}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: muted ? "none" : "1px solid var(--border)",
            background: muted ? "var(--danger)" : "var(--surface)",
            color: muted ? "#fff" : "var(--text)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        {isVideo && (
          <button
            onClick={toggleCamera}
            title={cameraOff ? t("callOverlay.enableCamera") : t("callOverlay.disableCamera")}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: cameraOff ? "none" : "1px solid var(--border)",
              background: cameraOff ? "var(--danger)" : "var(--surface)",
              color: cameraOff ? "#fff" : "var(--text)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
        )}
        <button
          onClick={hangUp}
          title={t("callOverlay.hangUp")}
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
