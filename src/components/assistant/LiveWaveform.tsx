import { useEffect, useRef } from "react";

/** Scrolling bar waveform drawn from a real level source (0..1). Flat on silence. */
export function LiveWaveform({ getLevel, color = "#1F3A37", className }: { getLevel: () => number; color?: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getRef = useRef(getLevel);
  getRef.current = getLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const BAR = 3, GAP = 2;
    let bars: number[] = [];
    let last = 0;
    let raf = 0;
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      const count = Math.max(1, Math.floor(w / (BAR + GAP)));
      if (now - last >= 50) {
        last = now;
        bars.push(getRef.current());
        if (bars.length > count) bars = bars.slice(-count);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const offset = w - bars.length * (BAR + GAP);
      for (let i = 0; i < count; i++) {
        const v = bars[i - (count - bars.length)] ?? 0;
        const bh = Math.max(2, v * h);
        const x = i < count - bars.length ? i * (BAR + GAP) : offset + (i - (count - bars.length)) * (BAR + GAP);
        ctx.globalAlpha = i < count - bars.length ? 0.25 : 0.85;
        ctx.fillRect(x, (h - bh) / 2, BAR, bh);
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
