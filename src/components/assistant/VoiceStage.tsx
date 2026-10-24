import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * One persistent voice stage. Progress p: 0 = expanded (large centred orb),
 * 1 = collapsed (small orb above the composer, transcript visible).
 * A vertical drag moves p continuously; release springs to the nearest end
 * (or the flick direction). The orb is never unmounted, so audio/mic and
 * reactive signals continue untouched.
 */
const BIG = 176;
const SMALL = 96;
const DRAG_SLOP = 6;

export function springStep(p: number, v: number, target: number, dt: number) {
  // Critically damped (ζ≈1): subtle settle, no bounce.
  const k = 170, c = 26;
  const a = k * (target - p) - c * v;
  const nv = v + a * dt;
  return { p: p + nv * dt, v: nv };
}

export function releaseTarget(p: number, velocityPerSec: number) {
  if (velocityPerSec > 1.2) return 1;
  if (velocityPerSec < -1.2) return 0;
  return p > 0.5 ? 1 : 0;
}

export function VoiceStage({ expanded, onExpandedChange, orb, transcript, bottom, onOrbTap }: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  orb: React.ReactNode;
  transcript: React.ReactNode;
  bottom: React.ReactNode;
  /** Tap on the orb while expanded (send/interrupt). */
  onOrbTap: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const pRef = useRef(expanded ? 0 : 1);
  const geo = useRef({ ex: 0, ey: 0, cx: 0, cy: 0 });
  const anim = useRef(0);
  const drag = useRef<{ id: number; y0: number; p0: number; moved: boolean; lastY: number; lastT: number; vel: number } | null>(null);
  const suppressClick = useRef(false);
  const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const apply = useCallback((p: number) => {
    const { ex, ey, cx, cy } = geo.current;
    const x = ex + (cx - ex) * p, y = ey + (cy - ey) * p;
    const s = 1 + (SMALL / BIG - 1) * p;
    const o = orbRef.current;
    if (o) {
      o.style.transform = `translate(${(x - BIG / 2).toFixed(1)}px, ${(y - BIG / 2).toFixed(1)}px) scale(${s.toFixed(4)})`;
      o.dataset.progress = p.toFixed(3);
    }
    const t = transcriptRef.current;
    if (t) { t.style.opacity = String(Math.max(0, Math.min(1, (p - 0.15) / 0.85))); t.style.pointerEvents = p > 0.98 ? "auto" : "none"; }
    const l = layerRef.current;
    if (l) l.style.pointerEvents = p > 0.98 ? "none" : "auto";
  }, []);

  const measure = useCallback(() => {
    const r = rootRef.current?.getBoundingClientRect();
    const s = slotRef.current?.getBoundingClientRect();
    if (!r || !s) return;
    const slotTop = s.top - r.top;
    geo.current = { ex: r.width / 2, ey: Math.max(BIG / 2 + 56, (56 + slotTop) / 2), cx: s.left - r.left + s.width / 2, cy: slotTop + s.height / 2 };
    if (layerRef.current) layerRef.current.style.height = `${slotTop + s.height}px`;
    apply(pRef.current);
  }, [apply]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (rootRef.current) ro.observe(rootRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  const animateTo = useCallback((target: number, v0 = 0) => {
    cancelAnimationFrame(anim.current);
    if (reduced) { pRef.current = target; apply(target); return; }
    let p = pRef.current, v = v0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      ({ p, v } = springStep(p, v, target, dt));
      if (Math.abs(target - p) < 0.002 && Math.abs(v) < 0.02) { p = target; pRef.current = p; apply(p); return; }
      pRef.current = p; apply(p);
      anim.current = requestAnimationFrame(tick);
    };
    anim.current = requestAnimationFrame(tick);
  }, [apply, reduced]);

  // External changes (Esc, tap small orb) run the same transition.
  useEffect(() => { const t = expanded ? 0 : 1; if (pRef.current !== t && !drag.current) animateTo(t); }, [expanded, animateTo]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (pRef.current > 0.98 || e.button > 0) return;
    cancelAnimationFrame(anim.current);
    drag.current = { id: e.pointerId, y0: e.clientY, p0: pRef.current, moved: false, lastY: e.clientY, lastT: e.timeStamp, vel: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      d.moved = true;
      layerRef.current?.setPointerCapture(e.pointerId);
    }
    const dist = Math.max(1, geo.current.cy - geo.current.ex * 0 - geo.current.ey);
    const p = Math.max(0, Math.min(1, d.p0 + dy / dist));
    const dtMs = Math.max(1, e.timeStamp - d.lastT);
    d.vel = 0.7 * d.vel + 0.3 * (((e.clientY - d.lastY) / dist) * 1000 / dtMs);
    d.lastY = e.clientY; d.lastT = e.timeStamp;
    pRef.current = p; apply(p);
  };
  const endDrag = (e: React.PointerEvent, cancelled = false) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    try { layerRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (!d.moved) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    const target = cancelled ? d.p0 : releaseTarget(pRef.current, d.vel);
    animateTo(target, cancelled ? 0 : d.vel);
    onExpandedChange(target === 0);
  };

  const onOrbClick = () => {
    if (suppressClick.current) return;
    if (pRef.current > 0.5) { onExpandedChange(true); return; }
    onOrbTap();
  };

  return (
    <div ref={rootRef} className="relative min-h-0 flex-1">
      <div ref={transcriptRef} className="absolute inset-0 flex flex-col" style={{ opacity: expanded ? 0 : 1 }}>{transcript}</div>
      <div ref={layerRef} data-testid="voice-drag-layer" className="absolute inset-x-0 top-0"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e)} onPointerCancel={(e) => endDrag(e, true)} />
      <div className="pointer-events-none absolute inset-x-0 px-4" style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        <div className="pointer-events-auto mx-auto w-full max-w-[640px]">
          <div ref={slotRef} className="mx-auto mb-6" style={{ width: SMALL, height: SMALL }} aria-hidden="true" />
          {bottom}
        </div>
      </div>
      <div ref={orbRef} data-testid="voice-orb-stage" className="absolute left-0 top-0" style={{ width: BIG, height: BIG, transformOrigin: "50% 50%", willChange: "transform", touchAction: "none" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e)} onPointerCancel={(e) => endDrag(e, true)}>
        <button type="button" onClick={onOrbClick} className="bani-voice-orb block rounded-full"
          aria-label={expanded ? "Bani voice orb" : "Expand voice view"}>
          {orb}
        </button>
      </div>
    </div>
  );
}

export default VoiceStage;
