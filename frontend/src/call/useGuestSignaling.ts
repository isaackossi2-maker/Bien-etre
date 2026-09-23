import { useCallback, useEffect, useRef, useState } from "react";

interface SignalMessage {
  type: string;
  [key: string]: unknown;
}

// Pendant du WebSocket partagé de CallContext, mais pour un invité externe sans compte : une
// connexion dédiée authentifiée par guestToken (voir backend/src/routes/meetings.ts
// `POST /:id/guest`) plutôt que par le token de session habituel. N'est utilisé que par
// ReunionRoom quand aucun utilisateur n'est connecté (voir son usage conditionnel).
export function useGuestSignaling(guestToken: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<(msg: SignalMessage) => void>>(new Set());
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    if (!guestToken) {
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
      return;
    }
    let cancelled = false;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?guestToken=${encodeURIComponent(guestToken!)}`);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };
      ws.onmessage = (event) => {
        let parsed: SignalMessage;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        listenersRef.current.forEach((listener) => listener(parsed));
      };
      ws.onclose = () => {
        setWsConnected(false);
        if (!cancelled) {
          reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [guestToken]);

  const sendSignal = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const onSignal = useCallback((listener: (msg: SignalMessage) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return { sendSignal, onSignal, wsConnected };
}
