import { useEffect, useRef, useState } from "react";
import { hkHour, skyLook, type SkyKey, type SkyLook } from "@/utils/topBarSky";
import { drawSkyGL, setupSkyGL } from "@/utils/topBarSkyGL";

// The top bar's sky: colours follow the Hong Kong time, clouds form and drift slowly, rain and typhoon winds
// follow the Observatory. Sits behind the top bar's content and never takes clicks. A still picture with
// reduced motion; a plain gradient where WebGL isn't available.

const css = (c: number[]) => `rgb(${c.map(Math.round).join(",")})`;

export function TopBarSky({ sky }: { sky: SkyKey }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef(sky);
  const [look, setLook] = useState<SkyLook>(() => skyLook(hkHour(), sky));
  const [gpu, setGpu] = useState(true);

  // Text colour and the fallback gradient follow the sky; checked each minute.
  useEffect(() => {
    skyRef.current = sky;
    setLook(skyLook(hkHour(), sky));
    const t = setInterval(() => setLook(skyLook(hkHour(), skyRef.current)), 60_000);
    return () => clearInterval(t);
  }, [sky]);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const s = setupSkyGL(canvas); if (!s) { setGpu(false); return; }
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const start = performance.now();
    let raf = 0, last = 0, drawn = -1e9;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - drawn < (still ? 60_000 : 33)) return; // still: once a minute; moving: ~30 frames a second
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
      if (!W || !H) return;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.033; last = now; drawn = now;
      drawSkyGL(s, { t: still ? 20 : (now - start) / 1000, dt, hour: hkHour(), sky: skyRef.current, dpr, still });
    };
    raf = requestAnimationFrame(frame);
    const lost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); setGpu(false); };
    canvas.addEventListener("webglcontextlost", lost);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener("webglcontextlost", lost); };
  }, []);

  return (
    <div className="topbar-sky pointer-events-none absolute inset-0 -z-10 overflow-hidden" data-tone={look.light ? "light" : "dark"} aria-hidden="true"
      style={{ background: `linear-gradient(180deg, ${css(look.cols[0])}, ${css(look.cols[1])} 55%, ${css(look.cols[2])})` }}>
      {gpu && <canvas ref={ref} className="block h-full w-full" />}
    </div>
  );
}
