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

/** Sharp stipple grain: luminance noise thresholded into crisp specks (dark or light). */
const grainSvg = (rgb: string, seed: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.15' numOctaves='3' seed='${seed}' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 ${rgb} 0 0 0 0 ${rgb} 0 0 0 0 ${rgb} 3 0 0 0 -1'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0 1 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
const GRAIN_DARK = grainSvg("0.08", 3);
const GRAIN_LIGHT = grainSvg("1", 9);

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
            background: "conic-gradient(#DCE8DA, #8FAF9D, #2F5E5A, #6E928A, #F2F7F4, #A9C2B5, #DCE8DA)",
            filter: `blur(${Math.round(6 + ((Math.max(22, Math.min(176, size)) - 22) / 154) * 6)}px)`,
          }}
        />
      </span>
      <span
        className="absolute bani-orb-drift"
        style={{ inset: "-20%", background: "radial-gradient(circle at 40% 40%, rgba(47,94,90,0.55), transparent 50%), radial-gradient(circle at 65% 70%, rgba(242,247,244,0.5), transparent 45%)", filter: "blur(6px)" }}
      />
      <span
        className="absolute bani-orb-grain pointer-events-none"
        style={{ inset: "-30%", backgroundImage: GRAIN_DARK, backgroundSize: "140px 140px", opacity: 0.55, mixBlendMode: "multiply" }}
      />
      <span
        className="absolute bani-orb-grain-b pointer-events-none"
        style={{ inset: "-30%", backgroundImage: GRAIN_LIGHT, backgroundSize: "140px 140px", opacity: 0.6, mixBlendMode: "screen" }}
      />
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
