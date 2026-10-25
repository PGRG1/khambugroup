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

/**
 * Film grain: contrast-boosted monochrome turbulence (never thresholded to 1-bit,
 * which reads as TV static). Two scales so the grit has depth.
 */
const GRAIN_A = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.62' numOctaves='3' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='1.9' intercept='-0.42'/%3E%3CfeFuncG type='linear' slope='1.9' intercept='-0.42'/%3E%3CfeFuncB type='linear' slope='1.9' intercept='-0.42'/%3E%3CfeFuncA type='linear' slope='2.6' intercept='0.18'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const GRAIN_B = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.35' numOctaves='2' seed='29' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='2.4' intercept='-0.6'/%3E%3CfeFuncG type='linear' slope='2.4' intercept='-0.6'/%3E%3CfeFuncB type='linear' slope='2.4' intercept='-0.6'/%3E%3CfeFuncA type='linear' slope='2.2' intercept='0.12'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const CSS = `
@keyframes bani-orb-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes bani-orb-swirl{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.12)}100%{transform:rotate(360deg) scale(1)}}
@keyframes bani-orb-drift{0%,100%{transform:translate(-8%,-6%) rotate(0deg)}33%{transform:translate(7%,4%) rotate(120deg)}66%{transform:translate(-3%,8%) rotate(240deg)}}
@keyframes bani-orb-grain{0%,100%{transform:translate(0,0)}12%{transform:translate(-7%,3%)}25%{transform:translate(4%,-6%)}37%{transform:translate(-3%,7%)}50%{transform:translate(6%,2%)}62%{transform:translate(-5%,-4%)}75%{transform:translate(2%,6%)}87%{transform:translate(-6%,-2%)}}
.bani-orb-thinking{animation:bani-orb-breathe 3.2s ease-in-out infinite}
.bani-orb-swirl{animation:bani-orb-swirl 14s linear infinite}
.bani-orb-drift{animation:bani-orb-drift 9s ease-in-out infinite}
.bani-orb-grain{animation:bani-orb-grain .5s steps(8) infinite}
.bani-orb-grain-b{animation:bani-orb-grain .6s steps(8) infinite reverse}
@media (prefers-reduced-motion: reduce){.bani-orb-thinking,.bani-orb-swirl,.bani-orb-drift,.bani-orb-grain,.bani-orb-grain-b{animation:none}}
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
      <span className="absolute bani-orb-swirl" style={{ inset: "-40%" }}>
        <span
          ref={matRef}
          className="absolute inset-0"
          style={{
            background: "conic-gradient(#8FAF9D, #2F5E5A, #1B3F3C, #6E928A, #DCE8DA, #4F7F78, #8FAF9D)",
            filter: `blur(${Math.round(6 + ((Math.max(22, Math.min(176, size)) - 22) / 154) * 8)}px)`,
          }}
        />
      </span>
      <span
        className="absolute bani-orb-drift"
        style={{ inset: "-20%", background: "radial-gradient(circle at 38% 42%, rgba(220,232,218,0.55), transparent 42%), radial-gradient(circle at 66% 68%, rgba(35,76,71,0.6), transparent 48%)", filter: "blur(8px)" }}
      />
      {/* Spherical shading: bottom shadow, top-left highlight, rim light */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.55), rgba(255,255,255,0) 34%), radial-gradient(circle at 50% 120%, rgba(16,40,38,0.65), rgba(16,40,38,0) 62%)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18), inset 0 -10px 24px rgba(16,40,38,0.35), inset 0 6px 18px rgba(242,247,244,0.35)",
        }}
      />
      <span
        className="absolute bani-orb-grain pointer-events-none"
        style={{ inset: "-30%", backgroundImage: GRAIN_A, backgroundSize: "180px 180px", opacity: 0.5, mixBlendMode: "overlay" }}
      />
      <span
        className="absolute bani-orb-grain-b pointer-events-none"
        style={{ inset: "-30%", backgroundImage: GRAIN_B, backgroundSize: "120px 120px", opacity: 0.34, mixBlendMode: "hard-light" }}
      />
      <svg
        data-testid="bani-orb-mark"
        viewBox="0 0 320 600"
        style={{ height: markH, width: (markH * 320) / 600, position: "relative", opacity: 0.92, filter: `drop-shadow(0 0 ${Math.max(2, size * 0.04)}px rgba(242,247,244,0.7))` }}
        fill="#F7FBF8"
      >
        {BANI_MARK_PATHS.map((d) => <path key={d} d={d} />)}
      </svg>
    </span>
  );
}

export default BaniOrb;
