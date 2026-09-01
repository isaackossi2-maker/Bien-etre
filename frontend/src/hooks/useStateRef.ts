import { useCallback, useRef, useState } from "react";

/**
 * Combine un useState et un useRef toujours synchronisés : le ref donne accès à la valeur
 * courante depuis des closures qui ne se recréent pas à chaque rendu (handlers WebSocket,
 * callbacks WebRTC...), sans les risques de "stale closure" d'un useState seul, tout en
 * déclenchant un re-rendu comme un useState normal.
 *
 * Remplace le pattern répété manuellement dans CallContext (un useState + un useRef + une
 * fonction "setXBoth" par valeur) par un seul appel de hook.
 */
export function useStateRef<T>(initial: T) {
  const [state, setState] = useState<T>(initial);
  const ref = useRef<T>(initial);

  const setBoth = useCallback((value: T) => {
    ref.current = value;
    setState(value);
  }, []);

  return [state, setBoth, ref] as const;
}
