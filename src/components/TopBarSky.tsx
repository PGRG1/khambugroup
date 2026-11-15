import { useEffect, useRef, useState } from "react";
import { hkHour, skyLook, type SkyKey, type SkyLook } from "@/utils/topBarSky";

// The top bar's sky, drawn on the graphics chip: colours follow the Hong Kong time, clouds form and drift
// slowly, rain and typhoon winds follow the Observatory. Sits behind the top bar's content; never takes clicks.
// With reduced motion it is a still picture; without WebGL the bar falls back to a plain gradient.

const VS = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";
const FS = `precision highp float;
uniform vec2 uRes; uniform float uT, uBand, uDpr;
uniform vec3 uTop, uMid, uBot, uLit, uShade, uSun, uMoon;
uniform float uCover, uWind, uRain, uLen, uHaze, uFlash, uBoltX, uStars, uN, uLow;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 6; i++){ v += a * noise(p); p = m * p; a *= 0.5; } return v; }
float rainLayer(vec2 q, float fl){
  float slant = 0.07 + uWind * 0.45; float colW = (2.6 + fl * 1.6) * uDpr; float seg = (18.0 + fl * 10.0) * uLen * uDpr;
  float x = q.x + q.y * slant; float id = floor(x / colW); float h = hash(vec2(id, fl * 7.13));
  if (h > uRain) return 0.0;
  float sp = (230.0 + fl * 80.0) * (1.0 + uWind * 0.7) * uLen * uDpr;
  float f = fract((q.y - uT * sp) / seg + h * 37.0); float len = 0.22 + 0.25 * hash(vec2(id, 3.1 + fl));
  float d = abs(fract(x / colW) - 0.5) * colW; float line = 1.0 - smoothstep(0.0, 0.9 * uDpr, d);
  return line * step(f, len) * (f / len) * (0.35 + 0.5 * h) * (1.0 - fl * 0.25); }
void main(){
  vec2 q = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float gy = clamp(q.y / uBand, 0.0, 1.0);
  vec3 col = gy < 0.55 ? mix(uTop, uMid, gy / 0.55) : mix(uMid, uBot, (gy - 0.55) / 0.45);
  if (uStars > 0.01) { vec2 g = floor(q / (2.0 * uDpr)); float h = hash(g); if (h > 0.9965) { float tw = 0.5 + 0.5 * sin(uT * (0.4 + h * 1.5) + h * 80.0); col += vec3(uStars * (0.35 + 0.65 * tw)); } }
  vec3 warm = mix(vec3(1.0, 0.96, 0.86), vec3(1.0, 0.67, 0.4), uLow);
  if (uSun.z > 0.01) { float d = length(q - uSun.xy); col += warm * exp(-d / (uBand * 1.1)) * 0.42 * uSun.z; col = mix(col, vec3(1.0, 0.99, 0.94), (1.0 - smoothstep(uBand * 0.13, uBand * 0.16, d)) * uSun.z); }
  if (uMoon.z > 0.01) { float r = max(5.5 * uDpr, uBand * 0.14); float d = length(q - uMoon.xy); col += vec3(0.85, 0.88, 1.0) * exp(-d / (r * 2.2)) * 0.16 * uMoon.z;
    float dk = length(q - uMoon.xy + vec2(r * 0.62, r * 0.05)); float lit = (1.0 - smoothstep(r - 1.0, r, d)) * smoothstep(r * 1.02 - 1.0, r * 1.02, dk); col = mix(col, vec3(0.96, 0.93, 0.86), lit * uMoon.z); }
  vec2 p = q / uBand * vec2(0.5, 1.35);
  float drift = uT * (0.022 + uWind * 0.32);
  vec2 w = vec2(fbm(p * 1.2 + vec2(uT * 0.012, 0.0)), fbm(p * 1.2 + vec2(5.2, 1.3) - uT * 0.009));
  vec2 cp = p * 1.7 + vec2(drift, 0.0) + w * 0.9;
  float dens = fbm(cp) * 0.78 + fbm(p * 3.4 + vec2(drift * 1.5, 0.0) + 7.0) * 0.32;
  dens *= 1.0 - pow(gy, 1.5) * (uCover > 0.6 ? 0.18 : 0.55);
  float th = 1.0 - uCover; float ca = smoothstep(th, th + 0.24, dens);
  float above = fbm(cp - vec2(0.0, 0.16)) * 0.78 + 0.16;
  float lt = clamp(0.55 + (dens - above) * 2.2 - gy * 0.25, 0.0, 1.0);
  vec3 cc = mix(uShade, uLit, lt);
  cc += vec3(0.8, 0.85, 1.0) * uFlash * (0.25 + 0.75 * ca) * exp(-abs(q.x - uBoltX) / (uRes.x * 0.22));
  col = mix(col, cc, ca * 0.96);
  col += vec3(0.6, 0.65, 0.8) * uFlash * 0.08;
  if (uRain > 0.0) { float r = rainLayer(q, 0.0) + rainLayer(q + vec2(31.0, 0.0), 1.0) + rainLayer(q + vec2(77.0, 0.0), 2.0);
    col = mix(col, mix(vec3(0.86, 0.9, 0.95), col + 0.18, uN * 0.5), clamp(r, 0.0, 1.0) * 0.5); }
  col = mix(col, mix(uMid, vec3(0.8, 0.83, 0.86), 0.18), uHaze * 1.6);
  gl_FragColor = vec4(col, 1.0); }`;

const UNIFORMS = ["uRes", "uT", "uBand", "uDpr", "uTop", "uMid", "uBot", "uLit", "uShade", "uSun", "uMoon", "uCover", "uWind", "uRain", "uLen", "uHaze", "uFlash", "uBoltX", "uStars", "uN", "uLow"] as const;
type U = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

function setup(canvas: HTMLCanvasElement): { gl: WebGLRenderingContext; u: U } | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const p = gl.createProgram()!; gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {} as U; for (const n of UNIFORMS) u[n] = gl.getUniformLocation(p, n);
  return { gl, u };
}

/** Where the sun or moon sits: towards the right, clear of the date on the left and the controls on the right. */
const bodyX = (w: number) => (w > 1000 ? w - 340 : w > 600 ? w - 250 : w * 0.66);
const css = (c: number[]) => `rgb(${c.map(Math.round).join(",")})`;

export function TopBarSky({ sky }: { sky: SkyKey }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef(sky); skyRef.current = sky;
  const [look, setLook] = useState<SkyLook>(() => skyLook(hkHour(), sky));
  const [gpu, setGpu] = useState(true);

  // Text colour and the fallback gradient follow the sky; checked each minute.
  useEffect(() => {
    setLook(skyLook(hkHour(), sky));
    const t = setInterval(() => setLook(skyLook(hkHour(), skyRef.current)), 60_000);
    return () => clearInterval(t);
  }, [sky]);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = setup(canvas); if (!ctx) { setGpu(false); return; }
    const { gl, u } = ctx;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const storm = { next: 3, age: 9, x: 0.5 };
    let raf = 0, last = 0, drawn = 0, lastStill = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (still ? now - lastStill < 60_000 && lastStill > 0 : now - drawn < 33) return; // still: once a minute; moving: ~30 frames a second
      drawn = now; lastStill = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1), cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw || !ch) return;
      const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.03; last = now;
      const L = skyLook(hkHour(), skyRef.current), w = L.weather;
      if (w.bolt && !still) { storm.next -= dt; if (storm.next < 0) { storm.age = 0; storm.next = (6 + Math.random() * 5) / w.bolt; storm.x = 0.15 + Math.random() * 0.75; } storm.age += dt; }
      const a = storm.age, flash = a < 0.07 ? 1 : a < 0.13 ? 0.2 : a < 0.2 ? 0.75 : a < 0.6 ? 0.75 * (1 - (a - 0.2) / 0.4) : 0;
      const band = 52 * dpr, sx = bodyX(cw) * dpr, sy = 52 * (0.92 - 0.55 * Math.sin(Math.PI * Math.max(0, Math.min(1, L.sunF)))) * dpr;
      gl.viewport(0, 0, W, H);
      gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uT, still ? 20 : now / 1000); gl.uniform1f(u.uBand, band); gl.uniform1f(u.uDpr, dpr);
      gl.uniform3f(u.uTop, L.cols[0][0] / 255, L.cols[0][1] / 255, L.cols[0][2] / 255);
      gl.uniform3f(u.uMid, L.cols[1][0] / 255, L.cols[1][1] / 255, L.cols[1][2] / 255);
      gl.uniform3f(u.uBot, L.cols[2][0] / 255, L.cols[2][1] / 255, L.cols[2][2] / 255);
      gl.uniform3f(u.uLit, L.lit[0] / 255, L.lit[1] / 255, L.lit[2] / 255); gl.uniform3f(u.uShade, L.shade[0] / 255, L.shade[1] / 255, L.shade[2] / 255);
      gl.uniform3f(u.uSun, sx, sy, L.sunA); gl.uniform3f(u.uMoon, sx, 52 * 0.42 * dpr, L.moonA);
      gl.uniform1f(u.uCover, w.cover); gl.uniform1f(u.uWind, w.wind ?? 0); gl.uniform1f(u.uRain, w.rain); gl.uniform1f(u.uLen, w.long ?? 1); gl.uniform1f(u.uHaze, w.haze ?? 0);
      gl.uniform1f(u.uFlash, flash); gl.uniform1f(u.uBoltX, storm.x * W); gl.uniform1f(u.uStars, L.starsA); gl.uniform1f(u.uN, L.night); gl.uniform1f(u.uLow, L.low);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(draw);
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
