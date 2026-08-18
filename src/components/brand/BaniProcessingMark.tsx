import { cn } from "@/lib/utils";

interface BaniProcessingMarkProps {
  /** Rendered height in px. Keep small: 18–20 inline, 24 for AI/document work, max 32. */
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Reusable Bani processing indicator — the five-triangle brand mark breathing
 * between Bani ink and Bani sage while Bani is thinking / reading / matching.
 * No rotation, no translation, no tracing, no sequential chase.
 */
const TRIANGLES = [
  { d: "M0 0 L160 100 L0 200 Z", dur: 2.1, delay: -0.4 },
  { d: "M160 100 L320 200 L160 300 Z", dur: 2.9, delay: -1.7 },
  { d: "M0 200 L160 300 L0 400 Z", dur: 2.4, delay: -0.9 },
  { d: "M160 300 L320 400 L160 500 Z", dur: 3.3, delay: -2.4 },
  { d: "M0 400 L160 500 L0 600 Z", dur: 2.6, delay: -1.2 },
];

export const BaniProcessingMark = ({ size = 24, className, label = "Bani is working" }: BaniProcessingMarkProps) => (
  <span
    role="status"
    aria-label={label}
    className={cn(
      "inline-flex shrink-0 items-center justify-center",
      "[--bani-rest:#25372B] [--bani-glow:#8FAF7E]",
      "dark:[--bani-rest:#8FAF7E] dark:[--bani-glow:#F5F4F0]",
      className,
    )}
    style={{ height: size, width: (size * 320) / 600 }}
  >
    <style>{`
      @keyframes bani-breathe {
        0%   { fill: var(--bani-rest); opacity: .45; }
        50%  { fill: var(--bani-glow); opacity: 1; }
        100% { fill: var(--bani-rest); opacity: .45; }
      }
      @media (prefers-reduced-motion: reduce) {
        .bani-pm path { animation: none !important; opacity: .8; fill: var(--bani-rest); }
      }
    `}</style>
    <svg viewBox="0 0 320 600" aria-hidden="true" className="bani-pm h-full w-full overflow-visible">
      {TRIANGLES.map((t) => (
        <path
          key={t.d}
          d={t.d}
          style={{
            fill: "var(--bani-rest)",
            animation: `bani-breathe ${t.dur}s cubic-bezier(0.45, 0, 0.55, 1) ${t.delay}s infinite`,
          }}
        />
      ))}
    </svg>
  </span>
);

export default BaniProcessingMark;
