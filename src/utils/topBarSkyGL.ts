// Draws the top bar sky with WebGL. No React here, so the same code runs in the app and in previews.
// Every moving part (cloud drift, cloud morphing, rain) is kept as a small, wrapped number before it reaches
// the graphics chip: noise repeats every 289 units and rain every 1, so wrapping never shows a jump and the
// sky keeps moving smoothly however long the page stays open (raw clock times freeze it after a while).
import { blendLook, skyLook, type SkyKey } from "@/utils/topBarSky";

/** Seconds a change in the weather takes to ease in (dry to rain, rain to clear, a new signal). */
export const WEATHER_BLEND_S = 60;

const VS = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }";
export const SKY_FS = `precision highp float;
uniform vec2 uRes; uniform float uT, uBand, uDpr;
uniform vec3 uTop, uMid, uBot, uLit, uShade, uSun, uMoon;
uniform float uCover, uWind, uRain, uLen, uHaze, uFlash, uBoltX, uStars, uN, uLow;
uniform vec4 uDrift; uniform vec3 uRainOff; uniform float uSheet;
float hash(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i0 = mod(i, 289.0), i1 = mod(i + 1.0, 289.0);
  return mix(mix(hash(i0), hash(vec2(i1.x, i0.y)), u.x), mix(hash(vec2(i0.x, i1.y)), hash(i1), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 7; i++){ v += a * noise(p); p = p * 2.0 + vec2(17.0, 9.0); a *= 0.5; } return v / 0.99; }
float rainLayer(vec2 q, float fl, float off){
  float slant = 0.07 + uWind * 0.45; float colW = (2.6 + fl * 1.7) * uDpr; float seg = (20.0 + fl * 12.0) * uLen * uDpr;
  float x = q.x + q.y * slant; float id = floor(x / colW); float h = hash(vec2(mod(id, 997.0), fl * 7.0 + 1.0));
  if (h > uRain) return 0.0;
  float f = fract(q.y / seg - off + h * 37.0); float len = 0.2 + 0.25 * hash(vec2(mod(id, 991.0), 3.0 + fl));
  float d = abs(fract(x / colW) - 0.5) * colW; float line = 1.0 - smoothstep(0.0, 0.8 * uDpr, d);
  return line * smoothstep(0.0, len, f) * step(f, len) * (0.3 + 0.55 * h) * (1.0 - fl * 0.28); }
void main(){
  vec2 q = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float gy = clamp(q.y / uBand, 0.0, 1.0);
  vec3 col = gy < 0.55 ? mix(uTop, uMid, smoothstep(0.0, 0.55, gy)) : mix(uMid, uBot, smoothstep(0.55, 1.0, gy));
  if (uStars > 0.01) { float cs = 6.0 * uDpr; vec2 g = floor(q / cs); float h = hash(mod(g, 997.0) + 0.5);
    if (h > 0.93) { vec2 c = (g + 0.2 + 0.6 * vec2(hash(g + 3.1), hash(g + 7.7))) * cs; float r = (0.35 + 0.5 * hash(g + 1.3)) * uDpr; float d = length(q - c);
      float tw = 0.55 + 0.45 * sin(uT * (0.35 + h * 1.2) + h * 80.0); col += vec3(uStars * tw * (1.0 - smoothstep(r * 0.4, r * 1.6, d)) * (0.45 + 0.55 * hash(g + 9.1))); } }
  vec3 warm = mix(vec3(1.0, 0.96, 0.86), vec3(1.0, 0.66, 0.38), uLow);
  float sunD = length(q - uSun.xy);
  if (uSun.z > 0.01) { col += warm * exp(-sunD / (uBand * 1.3)) * 0.45 * uSun.z; col = mix(col, vec3(1.0, 0.99, 0.95), (1.0 - smoothstep(uBand * 0.12, uBand * 0.155, sunD)) * uSun.z); }
  if (uMoon.z > 0.01) { float r = max(5.5 * uDpr, uBand * 0.14); float d = length(q - uMoon.xy); col += vec3(0.82, 0.86, 1.0) * exp(-d / (r * 2.4)) * 0.18 * uMoon.z;
    float dk = length(q - uMoon.xy + vec2(r * 0.62, r * 0.05)); float lit = (1.0 - smoothstep(r - uDpr, r, d)) * smoothstep(r * 1.02 - uDpr, r * 1.02, dk); col = mix(col, vec3(0.96, 0.93, 0.86), lit * uMoon.z); }
  vec2 p = q / uBand * vec2(0.42, 1.25);
  vec2 w = vec2(fbm(p + vec2(uDrift.z, 3.0)), fbm(p + vec2(5.0, 1.0) + vec2(uDrift.w, 0.0)));
  vec2 cp = p * 2.0 + vec2(uDrift.x, 0.0) + w * 1.1;
  float dens = fbm(cp) * 0.8 + fbm(p * 4.0 + vec2(uDrift.y, 7.0)) * 0.3;
  dens *= 1.0 - pow(gy, 1.6) * (uCover > 0.6 ? 0.15 : 0.5);
  float th = 1.0 - uCover; float ca = smoothstep(th, th + 0.26, dens);
  float above = fbm(cp - vec2(0.0, 0.18)) * 0.8 + 0.15;
  float lt = clamp(0.58 + (dens - above) * 2.4 - gy * 0.28, 0.0, 1.0);
  vec3 cc = mix(uShade, uLit, lt);
  if (uSun.z > 0.01) cc += warm * exp(-sunD / (uBand * 1.6)) * (1.0 - ca) * 0.9 * uSun.z;
  if (uMoon.z > 0.01) cc += vec3(0.62, 0.68, 0.85) * exp(-length(q - uMoon.xy) / (uBand * 1.8)) * (1.15 - ca) * 0.55 * uMoon.z;
  cc += vec3(0.8, 0.86, 1.0) * uFlash * (0.25 + 0.75 * ca) * exp(-abs(q.x - uBoltX) / (uRes.x * 0.22));
  col = mix(col, cc, ca * 0.97);
  col += vec3(0.6, 0.65, 0.8) * uFlash * 0.07;
  if (uRain > 0.0) { float r = rainLayer(q, 0.0, uRainOff.x) + rainLayer(q + vec2(31.0, 0.0), 1.0, uRainOff.y) + rainLayer(q + vec2(77.0, 0.0), 2.0, uRainOff.z);
    r *= 0.4 + 0.85 * noise(vec2(q.x / uBand * 0.35 + uSheet, 3.0 + q.y / uBand * 0.2)); // rain comes in sheets that sweep past with the wind
    col = mix(col, mix(vec3(0.86, 0.9, 0.95), col + 0.16, uN * 0.5), clamp(r, 0.0, 1.0) * 0.45); }
  col = mix(col, mix(uMid, vec3(0.8, 0.83, 0.86), 0.18), uHaze * 1.6);
  col += (hash(gl_FragCoord.xy + fract(uT) * 97.0) - 0.5) / 255.0 * 1.5;
  gl_FragColor = vec4(col, 1.0); }`;

const UNIFORMS = ["uRes", "uT", "uBand", "uDpr", "uTop", "uMid", "uBot", "uLit", "uShade", "uSun", "uMoon", "uCover", "uWind", "uRain", "uLen", "uHaze", "uFlash", "uBoltX", "uStars", "uN", "uLow", "uDrift", "uRainOff", "uSheet"] as const;
type U = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
export type SkyGL = { gl: WebGLRenderingContext; u: U; storm: { next: number; age: number; x: number }; move: { d0: number; d1: number; w0: number; w1: number; sheet: number }; change: { from: SkyKey | null; to: SkyKey | null; at: number } };

export function setupSkyGL(canvas: HTMLCanvasElement): SkyGL | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, SKY_FS);
  if (!vs || !fs) return null;
  const p = gl.createProgram()!; gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(p, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {} as U; for (const n of UNIFORMS) u[n] = gl.getUniformLocation(p, n);
  return { gl, u, storm: { next: 3, age: 9, x: 0.5 }, move: { d0: 0, d1: 0, w0: 0, w1: 0, sheet: 0 }, change: { from: null, to: null, at: 0 } };
}

/** Where the sun or moon sits: towards the right, clear of the date on the left and the controls on the right. */
export const bodyX = (w: number) => (w > 1000 ? w - 340 : w > 600 ? w - 250 : w * 0.66);
const wrap = (v: number, m: number) => ((v % m) + m) % m;

/**
 * One frame. `t` = seconds since the sky started (any size), `dt` = seconds since the last frame,
 * `hour` = Hong Kong hour (0–24). The canvas must already be sized; the sky band is the top 52 css px.
 */
export function drawSkyGL(s: SkyGL, opt: { t: number; dt: number; hour: number; sky: SkyKey; dpr: number; still?: boolean }) {
  const { gl, u, storm } = s, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, dpr = opt.dpr, cw = W / dpr;
  // A new weather eases in over a minute; the first frame starts as it is.
  const c = s.change;
  if (c.to === null) { c.from = c.to = opt.sky; c.at = opt.t; }
  else if (opt.sky !== c.to) { c.from = c.to; c.to = opt.sky; c.at = opt.t; }
  const target = skyLook(opt.hour, opt.sky), p = opt.still ? 1 : (opt.t - c.at) / WEATHER_BLEND_S;
  const L = c.from && c.from !== c.to && p < 1 ? blendLook(skyLook(opt.hour, c.from), target, p) : target;
  const w = L.weather, t = opt.t, wind = w.wind ?? 0, len = w.long ?? 1;
  if (w.bolt && !opt.still) { storm.next -= opt.dt; if (storm.next < 0) { storm.age = 0; storm.next = (6 + Math.random() * 5) / w.bolt; storm.x = 0.15 + Math.random() * 0.75; } storm.age += opt.dt; }
  const a = storm.age, flash = a < 0.07 ? 1 : a < 0.13 ? 0.2 : a < 0.2 ? 0.75 : a < 0.6 ? 0.75 * (1 - (a - 0.2) / 0.4) : 0;
  // Clouds travel at the weather's own pace; the wind rises and falls in gusts (stronger in storms and typhoons).
  const g = w.gust, gust = Math.max(0.2, 1 + g * (0.5 * Math.sin(t * 0.7) + 0.3 * Math.sin(t * 1.9 + 1) + 0.2 * Math.sin(t * 3.1 + 2)));
  const m = s.move, step = opt.still ? 0 : opt.dt, px = 0.84 / 52; // noise units per css px of the top layer
  m.d0 = wrap(m.d0 + step * w.drift * gust * px, 289); m.d1 = wrap(m.d1 + step * w.drift * 1.25 * gust * px * 2, 289);
  m.w0 = wrap(m.w0 + step * 0.022 * w.churn, 289); m.w1 = wrap(m.w1 - step * 0.017 * w.churn, 289);
  m.sheet = wrap(m.sheet + step * w.drift * 1.6 * gust * (0.35 / 52), 289);
  const drift = opt.still ? [3.1, 5.7, 1.3, 2.9] : [m.d0, m.d1, m.w0, m.w1];
  const rainOff = [0, 1, 2].map((fl) => wrap((t * (230 + fl * 80) * (1 + wind * 0.7)) / (20 + fl * 12), 1));
  const sx = bodyX(cw) * dpr, sy = 52 * (0.92 - 0.55 * Math.sin(Math.PI * Math.max(0, Math.min(1, L.sunF)))) * dpr;
  gl.viewport(0, 0, W, H);
  gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uT, wrap(t, 3600)); gl.uniform1f(u.uBand, 52 * dpr); gl.uniform1f(u.uDpr, dpr);
  gl.uniform3f(u.uTop, L.cols[0][0] / 255, L.cols[0][1] / 255, L.cols[0][2] / 255);
  gl.uniform3f(u.uMid, L.cols[1][0] / 255, L.cols[1][1] / 255, L.cols[1][2] / 255);
  gl.uniform3f(u.uBot, L.cols[2][0] / 255, L.cols[2][1] / 255, L.cols[2][2] / 255);
  gl.uniform3f(u.uLit, L.lit[0] / 255, L.lit[1] / 255, L.lit[2] / 255); gl.uniform3f(u.uShade, L.shade[0] / 255, L.shade[1] / 255, L.shade[2] / 255);
  gl.uniform3f(u.uSun, sx, sy, L.sunA); gl.uniform3f(u.uMoon, sx, 52 * 0.42 * dpr, L.moonA);
  gl.uniform1f(u.uCover, w.cover); gl.uniform1f(u.uWind, wind * (0.75 + 0.25 * gust)); gl.uniform1f(u.uRain, w.rain); gl.uniform1f(u.uLen, len); gl.uniform1f(u.uHaze, w.haze ?? 0);
  gl.uniform1f(u.uFlash, flash); gl.uniform1f(u.uBoltX, storm.x * W); gl.uniform1f(u.uStars, L.starsA); gl.uniform1f(u.uN, L.night); gl.uniform1f(u.uLow, L.low);
  gl.uniform4f(u.uDrift, drift[0], drift[1], drift[2], drift[3]); gl.uniform3f(u.uRainOff, rainOff[0], rainOff[1], rainOff[2]); gl.uniform1f(u.uSheet, m.sheet);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
