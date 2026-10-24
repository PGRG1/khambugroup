import { useEffect, useRef } from "react";
import { followLevel } from "@/components/assistant/BaniOrb";

/** Bar heights (0..1) for a level history; perceptual curve keeps quiet speech visible, silence stays 0. */
export function waveBarHeight(level: number): number {
  return level < 0.015 ? 0 : Math.min(0.92, Math.sqrt(level));
}

/**
 * Dense rounded bar waveform drawn from a real level source (0..1).
 * New samples enter on the right and scroll left across the full width; silence draws nothing.
 */
export function LiveWaveform({ getLevel, color = "#1F3A37", className }: { getLevel: () => number; color?: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getRef = useRef(getLevel);
  getRef.current = getLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const BAR = 3, GAP = 2, STEP_MS = 45;
    const bars: number[] = [];
    let smooth = 0, peak = 0, last = 0, raf = 0;
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      const count = Math.max(1, Math.floor((w + GAP) / (BAR + GAP)));
      // Sample every frame (keep the loudest since the last bar) so short syllables aren't missed.
      smooth = followLevel(smooth, getRef.current(), 0.6, 0.25);
      peak = Math.max(peak, smooth);
      if (now - last >= STEP_MS) {
        last = now;
        bars.push(peak);
        peak = 0;
        while (bars.length > count) bars.shift();
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const right = w - BAR;
      for (let i = bars.length - 1, slot = 0; i >= 0; i--, slot++) {
        const v = waveBarHeight(bars[i]);
        if (!v) continue;
        const bh = Math.max(BAR, v * h);
        const x = right - slot * (BAR + GAP);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, (h - bh) / 2, BAR, bh, BAR / 2);
        else ctx.rect(x, (h - bh) / 2, BAR, bh);
        ctx.fill();
      }
      canvas.dataset.last = (bars[bars.length - 1] ?? 0).toFixed(3);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [color]);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="dictation-waveform" className={className} />;
}

export default LiveWaveform;
