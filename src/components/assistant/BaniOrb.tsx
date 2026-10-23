type BaniOrbProps = { size: number; mode: "thinking" | "listening" | "idle"; className?: string };

const CSS = `
@keyframes bani-orb-spin{to{transform:rotate(360deg)}}
@keyframes bani-orb-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes bani-orb-listen{0%{transform:scale(1)}30%{transform:scale(1.12)}60%{transform:scale(0.97)}80%{transform:scale(1.09)}100%{transform:scale(1)}}
.bani-orb-spin{animation:bani-orb-spin 4s linear infinite}
.bani-orb-thinking{animation:bani-orb-breathe 3s ease-in-out infinite}
.bani-orb-listening{animation:bani-orb-listen 1.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.bani-orb-spin,.bani-orb-thinking,.bani-orb-listening{animation:none}}
`;

/** Animated Bani orb: rotating sage/petrol conic gradient with the outline Bani mark. */
export function BaniOrb({ size, mode, className }: BaniOrbProps) {
  const blur = Math.round(6 + ((Math.max(22, Math.min(110, size)) - 22) / 88) * 4);
  const markH = size * 0.34;
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${mode !== "idle" ? `bani-orb-${mode}` : ""} ${className ?? ""}`}
      style={{ width: size, height: size, boxShadow: `0 0 ${size * 0.4}px ${size * 0.07}px rgba(220,232,218,0.4)` }}
    >
      <style>{CSS}</style>
      <span
        className={mode === "idle" ? "absolute" : "bani-orb-spin absolute"}
        style={{
          inset: "-40%",
          background: "conic-gradient(#DCE8DA, #8FAF9D, #2F5E5A, #6E928A, #F2F7F4, #A9C2B5, #DCE8DA)",
          filter: `blur(${blur}px)`,
        }}
      />
      <span className="absolute inset-0" style={{ background: "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.75), transparent 45%)" }} />
      <svg
        viewBox="-1.5 -1.5 25.3 45"
        style={{ height: markH, width: markH * (25.3 / 45), position: "relative" }}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={size < 28 ? 3.2 : 2.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <polygon points="0,0 22.3,14 0,28" />
        <polygon points="0,14 22.3,28 0,42" />
        {size >= 28 && <line x1="11.2" y1="7" x2="11.2" y2="35" />}
      </svg>
    </span>
  );
}

export default BaniOrb;
