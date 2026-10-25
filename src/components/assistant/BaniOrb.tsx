import { useEffect, useRef, useState } from "react";

export type BaniOrbMode = "thinking" | "listening" | "speaking" | "idle";
type BaniOrbProps = {
  size: number;
  mode: BaniOrbMode;
  /** Live signal 0..1 (mic level while listening, playback envelope while speaking). */
  getLevel?: () => number;
  className?: string;
};

/** Official Bani mark geometry (same as BaniLoginMark / BaniProcessingMark). */
export const BANI_MARK_PATHS = [
  "M0 0 L160 100 L0 200 Z",
  "M160 100 L320 200 L160 300 Z",
  "M0 200 L160 300 L0 400 Z",
  "M160 300 L320 400 L160 500 Z",
  "M0 400 L160 500 L0 600 Z",
];

/** Smooth attack/release follower (pure, unit-tested). */
export function followLevel(prev: number, target: number, attack = 0.45, release = 0.12): number {
  const t = Math.max(0, Math.min(1, target));
  const k = t > prev ? attack : release;
  const next = prev + (t - prev) * k;
  return next < 0.002 ? 0 : next;
}

/** Per-state motion targets. focus = how fully the Bani mark forms out of the smoke. */
const TARGETS: Record<BaniOrbMode, { sp: number; focus: number; wob: number }> = {
  idle: { sp: 1, focus: 0, wob: 0.1 },
  listening: { sp: 1.6, focus: 0.15, wob: 0.16 },
  thinking: { sp: 0.6, focus: 0.55, wob: 0.05 },
  speaking: { sp: 2.2, focus: 1, wob: 0.06 },
};

const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

/** Smoky ink-flow sphere, petrol -> silver sage, with the Bani mark woven into the flow. */
const FS = `precision highp float;
uniform float t,lvl,focus,wob,glow;uniform vec2 res;
const vec3 k0=vec3(.184,.369,.353);const vec3 k1=vec3(.373,.549,.510);const vec3 k2=vec3(.616,.733,.667);
const vec3 k3=vec3(.827,.890,.824);const vec3 k4=vec3(.973,.984,.961);
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.55;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<4;i++){v+=a*n(p);p=m*p;a*=.48;}return v;}
vec3 ramp(float x){x=clamp(x,0.,1.);if(x<.25)return mix(k0,k1,x*4.);if(x<.5)return mix(k1,k2,(x-.25)*4.);if(x<.75)return mix(k2,k3,(x-.5)*4.);return mix(k3,k4,(x-.75)*4.);}
float cr(vec2 u,vec2 v){return u.x*v.y-u.y*v.x;}
float ed(vec2 p,vec2 a,vec2 b,float s){return s*cr(b-a,p-a)/length(b-a);}
float tri(vec2 p,vec2 a,vec2 b,vec2 c){float s=sign(cr(b-a,c-a));return min(min(ed(p,a,b,s),ed(p,b,c,s)),ed(p,c,a,s));}
float mark(vec2 m){float d=tri(m,vec2(0,0),vec2(160,100),vec2(0,200));
d=max(d,tri(m,vec2(160,100),vec2(320,200),vec2(160,300)));d=max(d,tri(m,vec2(0,200),vec2(160,300),vec2(0,400)));
d=max(d,tri(m,vec2(160,300),vec2(320,400),vec2(160,500)));d=max(d,tri(m,vec2(0,400),vec2(160,500),vec2(0,600)));return d;}
void main(){vec2 uv=(gl_FragCoord.xy/res)*2.-1.;float r=length(uv);
float z=sqrt(max(0.,1.-r*r));vec3 N=vec3(uv,z);
vec2 p=uv/(.6+.4*z)*.95;
vec2 q=vec2(fbm(p+vec2(0.,t*.035)),fbm(p+vec2(5.2,1.3)-t*.03));
float wq=2.2+lvl*1.2;
vec2 w=vec2(fbm(p+wq*q+vec2(1.7,9.2)+t*.05),fbm(p+wq*q+vec2(8.3,2.8)-t*.04));
float f=fbm(p+2.4*w);
float tone=smoothstep(.18,.92,f*1.15+q.y*.25-.1);
vec3 L=normalize(vec3(-.45,.55,.7));float dif=clamp(dot(N,L),0.,1.);
tone=tone*.75+dif*.35-.12+lvl*.12;
vec3 col=ramp(tone);
float H=.74,W=H*320./600.;
vec2 mu=uv+(w-.5)*wob;
vec2 m=vec2((mu.x+W*.5)/W*320.,(H*.5-mu.y)/H*600.);
float msk=smoothstep(-7.,7.,mark(m));
float form=smoothstep(.3,.7,fbm(p*1.4+w*1.6+vec2(t*.06,-t*.05)));
float vis=mix(mix(.25,.95,form),1.,focus);
vec3 lit=mix(col,vec3(.97,.99,.96),.62+.3*(f-.5));
col=mix(col,lit,msk*vis*(.85+glow*.15));
col+=msk*glow*.12;
col*=mix(.72,1.,smoothstep(0.,.55,z));
col=mix(col,k0*.9,smoothstep(.62,1.,r)*.55);
col+=.35*smoothstep(.9,.975,r)*smoothstep(1.,.975,r)*clamp(dot(normalize(uv+1e-5),vec2(-.6,.8))*.5+.6,0.,1.);
col+=(.08+glow*.06)*pow(dif,6.);
col+=(h(gl_FragCoord.xy+fract(t*9.))-.5)*.12;
float a=smoothstep(1.,.985,r);gl_FragColor=vec4(col*a,a);}`;

/**
 * Bani orb: smoky ink-flow sphere (petrol -> silver sage) with the Bani mark woven into
 * the smoke. Idle: mark half-formed. Listening: swells and swirls with the mic level.
 * Thinking: slows and gathers into the mark. Speaking: mark in full focus, glowing with speech.
 * Falls back to a static CSS sphere + mark when WebGL is unavailable.
 */
export function BaniOrb({ size, mode, getLevel, className }: BaniOrbProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getRef = useRef(getLevel);
  getRef.current = getLevel;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const reduced = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(1, Math.round(size * dpr));
    canvas.width = px;
    canvas.height = px;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    } catch {
      gl = null;
    }
    let uT: WebGLUniformLocation | null = null;
    let uL: WebGLUniformLocation | null = null;
    let uF: WebGLUniformLocation | null = null;
    let uW: WebGLUniformLocation | null = null;
    let uG: WebGLUniformLocation | null = null;
    if (gl) {
      const context = gl;
      const compile = (type: number, src: string) => {
        const s = context.createShader(type);
        if (!s) throw new Error("Unable to create orb shader");
        context.shaderSource(s, src);
        context.compileShader(s);
        return s;
      };
      const prog = gl.createProgram();
      if (!prog) return;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl = null;
      } else {
        gl.useProgram(prog);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.viewport(0, 0, px, px);
        gl.uniform2f(gl.getUniformLocation(prog, "res"), px, px);
        uT = gl.getUniformLocation(prog, "t");
        uL = gl.getUniformLocation(prog, "lvl");
        uF = gl.getUniformLocation(prog, "focus");
        uW = gl.getUniformLocation(prog, "wob");
        uG = gl.getUniformLocation(prog, "glow");
      }
    }
    setFallback(!gl);

    const cur = { ...TARGETS[modeRef.current] };
    let t = Math.random() * 50;
    let lv = 0;
    let gw = 0;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const m = modeRef.current;
      const g = TARGETS[m];
      const ease = Math.min(1, dt * 3);
      cur.sp += (g.sp - cur.sp) * ease;
      cur.focus += (g.focus - cur.focus) * ease;
      cur.wob += (g.wob - cur.wob) * ease;
      const audio = m === "listening" || m === "speaking";
      const raw = audio ? getRef.current?.() ?? 0 : m === "thinking" ? 0.12 + 0.08 * Math.sin(now * 0.002) : 0;
      lv = followLevel(lv, raw);
      gw += ((m === "speaking" ? lv : 0) - gw) * 0.3;
      if (!reduced) t += dt * cur.sp * (1 + lv * 1.8);
      if (gl) {
        gl.uniform1f(uT, t);
        gl.uniform1f(uL, lv);
        gl.uniform1f(uF, cur.focus);
        gl.uniform1f(uW, reduced ? 0.04 : cur.wob * (1 + lv));
        gl.uniform1f(uG, gw);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      const swell = reduced ? 0.03 : m === "listening" ? 0.09 : 0.05;
      const breathe = !reduced && m === "thinking" ? 0.02 * Math.sin(now * 0.003) : 0;
      root.style.transform = `scale(${(1 + lv * swell + breathe).toFixed(4)})`;
      root.dataset.level = lv.toFixed(3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      root.dataset.level = "0";
      root.style.transform = "";
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [size]);

  const markH = size * 0.36;
  return (
    <span
      ref={rootRef}
      aria-hidden="true"
      data-mode={mode}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        willChange: "transform",
        boxShadow: `0 ${(size * 0.09).toFixed(1)}px ${(size * 0.19).toFixed(1)}px rgba(20,52,48,.32), 0 ${(size * 0.02).toFixed(1)}px ${(size * 0.055).toFixed(1)}px rgba(20,52,48,.18), 0 0 0 1px rgba(255,255,255,.35)`,
        background: fallback
          ? "radial-gradient(circle at 32% 28%, #F8FBF5 0%, #D3E3D2 22%, #9DBBAA 48%, #5F8C82 74%, #2F5E5A 100%)"
          : undefined,
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 rounded-full"
        style={{ width: size, height: size, display: fallback ? "none" : "block" }}
      />
      {fallback && (
        <svg
          data-testid="bani-orb-mark"
          viewBox="0 0 320 600"
          style={{ height: markH, width: (markH * 320) / 600, position: "relative", opacity: 0.92 }}
          fill="#F7FBF8"
        >
          {BANI_MARK_PATHS.map((d) => <path key={d} d={d} />)}
        </svg>
      )}
    </span>
  );
}

export default BaniOrb;
