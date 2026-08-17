import { useEffect, useLayoutEffect, useRef, useState } from "react";

const PATHS = [
  "M0 0 L160 100 L0 200 Z",
  "M160 100 L320 200 L160 300 Z",
  "M0 200 L160 300 L0 400 Z",
  "M160 300 L320 400 L160 500 Z",
  "M0 400 L160 500 L0 600 Z",
];

const TRACE_EASE = "cubic-bezier(0.42, 0, 0.2, 1)";
const MOVE_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
const FADE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

const T = {
  trace: 1500,
  solidStart: 1300,
  solidDur: 550,
  moveStart: 1700,
  moveDur: 1650,
  wordStart: 2650,
  wordDur: 650,
  fadeStart: 3400,
  fadeDur: 650,
};

interface AuthEntranceProps {
  markRef: React.RefObject<SVGSVGElement>;
  wordRef: React.RefObject<HTMLSpanElement>;
  onFinish: () => void;
  /** Called shortly before the overlay fades, so the real header brand can appear underneath. */
  onHandoff: () => void;
}

/** One-shot branded entrance: line trace -> solid mark -> flight into the header brand. */
export const AuthEntrance = ({ markRef, wordRef, onFinish, onHandoff }: AuthEntranceProps) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(false);
  const [moved, setMoved] = useState(false);
  const [word, setWord] = useState(false);
  const [fading, setFading] = useState(false);
  const [transform, setTransform] = useState<string>("none");
  const [wordBox, setWordBox] = useState<{ left: number; top: number; fontSize: string; lineHeight: string } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      const target = markRef.current;
      if (!stage || !target) return;
      const a = stage.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      if (!a.height || !b.height) return;
      const scale = b.height / a.height;
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      setTransform(`translate3d(${dx}px, ${dy}px, 0) scale(${scale})`);

      const w = wordRef.current;
      if (w) {
        const r = w.getBoundingClientRect();
        const cs = getComputedStyle(w);
        setWordBox({ left: r.left, top: r.top, fontSize: cs.fontSize, lineHeight: cs.lineHeight });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [markRef, wordRef]);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setSolid(true), T.solidStart),
      window.setTimeout(() => setMoved(true), T.moveStart),
      window.setTimeout(() => setWord(true), T.wordStart),
      window.setTimeout(() => {
        onHandoff();
        setFading(true);
      }, T.fadeStart),
      window.setTimeout(onFinish, T.fadeStart + T.fadeDur),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onFinish, onHandoff]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 bg-carbon"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${T.fadeDur}ms ${EASE}`,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <style>{`@keyframes bani-trace { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }`}</style>

      {/* Flying mark: starts centred, lands on the real header brand */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: "translate3d(-50%, -50%, 0)",
        }}
      >
        <div
          ref={stageRef}
          style={{
            height: "clamp(240px, 46vh, 420px)",
            aspectRatio: "320 / 600",
            transform: moved ? transform : "none",
            transition: `transform ${T.moveDur}ms ${EASE}`,
            willChange: "transform",
          }}
        >
          {/* Outline trace */}
          <svg
            viewBox="0 0 320 600"
            className="absolute inset-0 h-full w-full text-sage"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{
              opacity: solid ? 0 : 1,
              transition: `opacity ${T.solidDur}ms ${EASE}`,
            }}
          >
            <g opacity="0.18">
              {PATHS.map((d) => (
                <path key={`ghost-${d}`} d={d} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
            <g>
              {PATHS.map((d, i) => (
                <path
                  key={`trace-${d}`}
                  d={d}
                  pathLength={1}
                  vectorEffect="non-scaling-stroke"
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: 1,
                    animation: `bani-trace ${T.trace - i * 90}ms ${EASE} ${i * 90}ms forwards`,
                  }}
                />
              ))}
            </g>
          </svg>

          {/* Solid mark */}
          <svg
            viewBox="0 0 320 600"
            className="absolute inset-0 h-full w-full text-bone"
            fill="currentColor"
            style={{
              opacity: solid ? 1 : 0,
              transition: `opacity ${T.solidDur}ms ${EASE}`,
            }}
          >
            {PATHS.map((d) => (
              <path key={`solid-${d}`} d={d} />
            ))}
          </svg>
        </div>
      </div>

      {/* Wordmark, revealed exactly where the header wordmark sits */}
      {wordBox && (
        <span
          className="absolute font-geist font-light tracking-tight text-bone"
          style={{
            left: wordBox.left,
            top: wordBox.top,
            fontSize: wordBox.fontSize,
            lineHeight: wordBox.lineHeight,
            opacity: word ? 1 : 0,
            transition: `opacity ${T.wordDur}ms ${EASE}`,
          }}
        >
          Bani
        </span>
      )}
    </div>
  );
};

export default AuthEntrance;
