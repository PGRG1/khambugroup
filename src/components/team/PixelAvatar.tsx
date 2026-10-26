import { useMemo } from "react";

const PALS = [
  { hair: [43, 36, 32], skin: [222, 176, 138], cloth: [31, 63, 59], style: 0 },
  { hair: [30, 26, 23], skin: [236, 194, 160], cloth: [47, 94, 90], style: 1 },
  { hair: [70, 48, 34], skin: [198, 142, 103], cloth: [142, 59, 46], style: 2 },
  { hair: [42, 34, 29], skin: [242, 204, 170], cloth: [62, 90, 138], style: 1 },
  { hair: [96, 90, 86], skin: [190, 132, 96], cloth: [43, 47, 54], style: 0 },
  { hair: [55, 40, 30], skin: [228, 182, 146], cloth: [120, 96, 60], style: 2 },
];

type Px = { bg: string; anim: string } | null;

function avatar(seed: number, pal: number): Px[] {
  const P = PALS[pal % PALS.length];
  let r = seed;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const rgb = (c: number[], k: number) => "rgb(" + c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(",") + ")";
  const out: Px[] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 7.5;
    const head = (dx / 4.2) ** 2 + ((y - 7) / 5) ** 2 <= 1;
    const face = head && y >= 5 && Math.abs(dx) <= 3.4;
    let c: number[] | null = null, k = 1, eye = false, isHair = false;
    if (P.style === 0) isHair = (head && y <= 4) || ((dx / 4.7) ** 2 + ((y - 6) / 5.4) ** 2 <= 1 && y <= 6 && !face);
    else if (P.style === 1) isHair = ((dx / 5.1) ** 2 + ((y - 7.5) / 6.6) ** 2 <= 1) && y <= 12 && !face;
    else isHair = (head && y <= 4) || (y <= 2 && Math.abs(dx) <= 2.5) || (dx < -3 && y >= 3 && y <= 8 && head);
    if (isHair) { c = P.hair; k = 0.9 + rnd() * 0.25; }
    else if (head) { c = P.skin; k = 1.06 - (dx + 4) * 0.025 - (y > 9 ? 0.04 : 0); }
    else if (Math.abs(dx) <= 1.6 && y >= 11 && y <= 12) { c = P.skin; k = 0.86; }
    else if (y >= 13 && Math.abs(dx) <= 3.2 + (y - 13) * 2.4) { c = P.cloth; k = 0.92 + rnd() * 0.16; }
    if (head && !isHair && y === 7 && (x === 5 || x === 10)) { c = [38, 32, 28]; k = 1; eye = true; }
    if (head && !isHair && y === 10 && (x === 7 || x === 8)) { c = P.skin; k = 0.78; }
    if (!c) { out.push(null); continue; }
    const glow = !eye && rnd() < 0.35;
    out.push({ bg: rgb(c, k), anim: glow ? `pxglow ${(2.4 + rnd() * 2.2).toFixed(2)}s ease-in-out ${(rnd() * 4).toFixed(2)}s infinite` : "none" });
  }
  return out;
}

/** 16×16 pixel-art bust, transparent background, deterministic per seed/palette. */
export function PixelAvatar({ seed, palette, size = 48 }: { seed: number; palette: number; size?: number }) {
  const cells = useMemo(() => avatar(seed, palette), [seed, palette]);
  const px = size / 16;
  return (
    <div
      aria-hidden="true"
      className="pixel-avatar"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(16, ${px}px)`,
        gridTemplateRows: `repeat(16, ${px}px)`,
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {cells.map((c, i) => (
        <span key={i} style={c ? { background: c.bg, animation: c.anim } : undefined} />
      ))}
    </div>
  );
}
