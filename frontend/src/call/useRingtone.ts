import { useEffect } from "react";

// Sonnerie synthétique (bip répété) jouée pendant qu'un appel entrant (1:1 ou de
// groupe) sonne. Partagé entre CallOverlay et GroupCallOverlay, qui avaient
// chacun leur propre copie identique de cette logique.
export function useRingtone(active: boolean) {
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
