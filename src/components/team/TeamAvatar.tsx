import { memo, type ReactElement } from "react";
import "./team.css";
import { TEAM_CHARACTERS, type TeamCharacterKey } from "./teamCharacters";

/**
 * One of Bani's team characters, drawn as crisp pixel art.
 * - variant "full": the character holding their prop (chart board, box, calculator, clipboard, key, magnifying glass)
 * - variant "bust": head and shoulders only, for very small spots
 * Each cell is a whole number of screen pixels (`px`, or the `--ta-px` CSS variable when set), so it never blurs.
 * With `tile`, it sits on its own pale signature colour, aligned to the bottom edge.
 */
export const TeamAvatar = memo(function TeamAvatar({
  role,
  variant = "full",
  px = 2,
  tile = false,
  className = "",
}: {
  role: TeamCharacterKey;
  variant?: "full" | "bust";
  px?: number;
  tile?: boolean;
  className?: string;
}) {
  const ch = TEAM_CHARACTERS[role];
  const s = ch[variant];
  const cell = `var(--ta-px, ${px}px)`;
  const cells: ReactElement[] = [];
  for (let i = 0; i < s.px.length; i++) {
    const k = s.px[i];
    if (k === ".") { cells.push(<i key={i} />); continue; }
    const fx = s.fx[i];
    cells.push(
      <i
        key={i}
        className={fx === "e" ? "e" : fx === "g" ? "g" : undefined}
        style={{ background: s.pal[parseInt(k, 36)] }}
      />,
    );
  }
  const sprite = (
    <span
      aria-hidden="true"
      className="team-avatar"
      style={{
        gridTemplateColumns: `repeat(${s.w}, ${cell})`,
        gridTemplateRows: `repeat(${s.h}, ${cell})`,
        ["--ta-skin" as any]: ch.skin,
        ["--ta-d" as any]: `${ch.delay}s`,
      }}
    >
      {cells}
    </span>
  );
  if (!tile) return sprite;
  return (
    <span aria-hidden="true" className={`team-avatar-tile ${className}`} style={{ background: ch.tint }}>
      {sprite}
    </span>
  );
});

/** The five roles on "Your team" map straight onto character keys. */
export type { TeamCharacterKey };
