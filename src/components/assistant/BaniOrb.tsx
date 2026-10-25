import { Suspense, lazy, useEffect, useRef, useState } from "react";

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

/** Soft continuous film grain (greyscale, no thresholding). */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

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

/** Official ElevenLabs UI Orb (MIT), lazy-loaded so the CSS orb renders first and SSR/jsdom never touch WebGL. */
const LazyElevenOrb = lazy(() =>
  import("@/components/ui/orb").then((m) => ({ default: m.Orb })),
);

const ORB_COLORS: [string, string] = ["#6E928A", "#C4D6C6"];

function agentStateFor(mode: BaniOrbMode): "thinking" | "listening" | "talking" | null {
  if (mode === "listening") return "listening";
  if (mode === "speaking") return "talking";
  if (mode === "thinking") return "thinking";
  return null;
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The original sage/petrol CSS orb (visual only; no surrounding box-shadow). */
function CssOrbVisual({ size, mode }: { size: number; mode: BaniOrbMode }) {
  return (
    <span className="absolute inset-0 overflow-hidden rounded-full">
      <style>{CSS}</style>
      <span className="absolute bani-orb-swirl" style={{ inset: "-40%" }}>
        <span
          className="absolute inset-0"
          style={{
            background: "conic-gradient(var(--bani-orb-c1,#8FAF9D), var(--bani-orb-c2,#2F5E5A), var(--bani-orb-c3,#1B3F3C), var(--bani-orb-c4,#6E928A), var(--bani-orb-c5,#DCE8DA), var(--bani-orb-c6,#4F7F78), var(--bani-orb-c1,#8FAF9D))",
            filter: `blur(${Math.round(6 + ((Math.max(22, Math.min(176, size)) - 22) / 154) * 8)}px)`,
          }}
        />
      </span>
      <span
        className="absolute bani-orb-drift"
        style={{ inset: "-20%", background: "radial-gradient(circle at 38% 42%, rgba(var(--bani-orb-hi,220,232,218),0.55), transparent 42%), radial-gradient(circle at 66% 68%, rgba(var(--bani-orb-deep,35,76,71),0.6), transparent 48%)", filter: "blur(8px)" }}
      />
      {/* Spherical shading: bottom shadow, top-left highlight, rim light */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 32% 26%, rgba(255,255,255,0.55), rgba(255,255,255,0) 34%), radial-gradient(circle at 50% 120%, rgba(var(--bani-orb-shadow,16,40,38),0.65), rgba(var(--bani-orb-shadow,16,40,38),0) 62%)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18), inset 0 -10px 24px rgba(var(--bani-orb-shadow,16,40,38),0.35), inset 0 6px 18px rgba(242,247,244,0.35)",
        }}
      />
      <span
        className="absolute bani-orb-grain pointer-events-none"
        style={{ inset: "-30%", backgroundImage: GRAIN, backgroundSize: "160px 160px", opacity: 0.22, mixBlendMode: "overlay" }}
      />
    </span>
  );
}

/**
 * Bani orb: the official ElevenLabs UI Orb in Bani's sage/petrol colours with the
 * five-triangle mark on top. Falls back to the CSS orb while loading, when WebGL
 * is unavailable, or when reduced motion is preferred.
 */
export function BaniOrb({ size, mode, getLevel, className }: BaniOrbProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const getRef = useRef(getLevel);
  getRef.current = getLevel;
  const [useWebgl, setUseWebgl] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setUseWebgl(!reduced && webglAvailable());
  }, []);

  // Keep the CSS orb's audio-reactive scale/glow only when it is the active renderer.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || useWebgl) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const audioDriven = mode === "listening" || mode === "speaking";
    let level = 0;
    let raf = 0;
    const apply = () => {
      const scale = 1 + level * (reduced ? 0.04 : mode === "speaking" ? 0.1 : 0.14);
      root.style.transform = `scale(${scale.toFixed(4)})`;
      root.style.boxShadow = `0 0 ${(size * (0.3 + level * 0.35)).toFixed(1)}px ${(size * (0.05 + level * 0.08)).toFixed(1)}px rgba(var(--bani-orb-hi,220,232,218),${(0.35 + level * 0.45).toFixed(3)})`;
      root.dataset.level = level.toFixed(3);
    };
    const tick = () => {
      const raw = audioDriven ? getRef.current?.() ?? 0 : 0;
      level = followLevel(level, raw);
      apply();
      raf = requestAnimationFrame(tick);
    };
    if (audioDriven) raf = requestAnimationFrame(tick);
    else { level = 0; apply(); root.style.transform = ""; }
    return () => { cancelAnimationFrame(raf); root.dataset.level = "0"; };
  }, [mode, size, useWebgl]);

  const markH = size * 0.36;
  return (
    <span
      ref={rootRef}
      aria-hidden="true"
      data-mode={mode}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${mode === "thinking" && !useWebgl ? "bani-orb-thinking" : ""} ${className ?? ""}`}
      style={{ width: size, height: size, boxShadow: `0 0 ${size * 0.3}px ${size * 0.05}px rgba(var(--bani-orb-hi,220,232,218),0.35)`, willChange: "transform" }}
    >
      {useWebgl ? (
        <Suspense fallback={<CssOrbVisual size={size} mode={mode} />}>
          <span className="absolute inset-0">
            <LazyElevenOrb
              colors={ORB_COLORS}
              agentState={agentStateFor(mode)}
              volumeMode="manual"
              getInputVolume={mode === "listening" ? () => getRef.current?.() ?? 0 : undefined}
              getOutputVolume={mode === "speaking" ? () => getRef.current?.() ?? 0 : undefined}
              className="relative h-full w-full"
            />
          </span>
        </Suspense>
      ) : (
        <CssOrbVisual size={size} mode={mode} />
      )}
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
