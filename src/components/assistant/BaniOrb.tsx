import { useEffect, useRef } from "react";

export type BaniOrbMode = "thinking" | "listening" | "speaking" | "idle";
type BaniOrbProps = {
  size: number;
  mode: BaniOrbMode;
  /** Live signal 0..1 (mic level while listening, playback envelope while speaking). */
  getLevel?: () => number;
  className?: string;
};

/** Official Bani mark geometry (same as BaniLoginMark / BaniProcessingMark). */
export const BANI_MARK_PATHS = [
  "M0 0 L160 100 L0 200 Z",
  "M160 100 L320 200 L160 300 Z",
  "M0 200 L160 300 L0 400 Z",
  "M160 300 L320 400 L160 500 Z",
  "M0 400 L160 500 L0 600 Z",
];

const CSS = `
@keyframes bani-orb-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.bani-orb-thinking{animation:bani-orb-breathe 3.2s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.bani-orb-thinking{animation:none}}
`;

/** Smooth attack/release follower (pure, unit-tested). */
export function followLevel(prev: number, target: number, attack = 0.45, release = 0.12): number {
  const t = Math.max(0, Math.min(1, target));
  const k = t > prev ? attack : release;
  const next = prev + (t - prev) * k;
  return next < 0.002 ? 0 : next;
}

/**
 * Bani orb: sage/petrol material with the official five-triangle mark.
 * Motion comes only from the real audio signal passed in getLevel; silence settles it.
 * Thinking uses a quiet, distinct breathe that is not audio-driven.
 */
export function BaniOrb({ size, mode, getLevel, className }: BaniOrbProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const matRef = useRef<HTMLSpanElement>(null);
  const getRef = useRef(getLevel);
  getRef.current = getLevel;

  useEffect(() => {
    const root = rootRef.current;
    const mat = matRef.current;
    if (!root || !mat) return;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const audioDriven = mode === "listening" || mode === "speaking";
    let level = 0;
    let angle = 0;
    let raf = 0;
    const apply = () => {
      const scale = 1 + level * (reduced ? 0.04 : mode === "speaking" ? 0.1 : 0.14);
      root.style.transform = `scale(${scale.toFixed(4)})`;
      root.style.boxShadow = `0 0 ${(size * (0.3 + level * 0.35)).toFixed(1)}px ${(size * (0.05 + level * 0.08)).toFixed(1)}px rgba(220,232,218,${(0.35 + level * 0.45).toFixed(3)})`;
      mat.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      root.dataset.level = level.toFixed(3);
    };
    const tick = () => {
      const raw = audioDriven ? getRef.current?.() ?? 0 : 0;
      level = followLevel(level, raw);
      // Material moves only with sound: no sound, no rotation.
      if (!reduced) angle = (angle + level * (mode === "speaking" ? 5 : 7)) % 360;
      apply();
      raf = requestAnimationFrame(tick);
    };
    if (audioDriven) raf = requestAnimationFrame(tick);
    else { level = 0; apply(); root.style.transform = ""; }
    return () => { cancelAnimationFrame(raf); root.dataset.level = "0"; };
  }, [mode, size]);

  const markH = size * 0.36;
  return (
    <span
      ref={rootRef}
      aria-hidden="true"
      data-mode={mode}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${mode === "thinking" ? "bani-orb-thinking" : ""} ${className ?? ""}`}
      style={{ width: size, height: size, boxShadow: `0 0 ${size * 0.3}px ${size * 0.05}px rgba(220,232,218,0.35)`, willChange: "transform" }}
    >
      <style>{CSS}</style>
      <span
        ref={matRef}
        className="absolute"
        style={{
          inset: "-40%",
          background: mode === "speaking"
            ? "conic-gradient(#DCE8DA, #6E928A, #2F5E5A, #8FAF9D, #F2F7F4, #A9C2B5, #DCE8DA)"
            : "conic-gradient(#DCE8DA, #8FAF9D, #2F5E5A, #6E928A, #F2F7F4, #A9C2B5, #DCE8DA)",
          filter: `blur(${Math.round(6 + ((Math.max(22, Math.min(176, size)) - 22) / 154) * 6)}px)`,
        }}
      />
      <span className="absolute inset-0" style={{ background: "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.75), transparent 45%)" }} />
      <svg
        data-testid="bani-orb-mark"
        viewBox="0 0 320 600"
        style={{ height: markH, width: (markH * 320) / 600, position: "relative" }}
        fill="#FFFFFF"
      >
        {BANI_MARK_PATHS.map((d) => <path key={d} d={d} />)}
      </svg>
    </span>
  );
}

export default BaniOrb;
