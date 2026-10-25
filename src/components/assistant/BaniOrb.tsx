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

/** Per-state motion targets. sp = flow speed, focus = how fully the Bani mark forms, wob = mark ripple. */
const TARGETS: Record<BaniOrbMode, { sp: number; focus: number; wob: number }> = {
  idle: { sp: 1.8, focus: 0, wob: 0.08 },
  listening: { sp: 2.6, focus: 0.15, wob: 0.13 },
  thinking: { sp: 1.0, focus: 0.55, wob: 0.05 },
  speaking: { sp: 2.8, focus: 1, wob: 0.06 },
};

const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

/** 3D rolling smoke sphere (petrol -> sage -> aqua glow), steady grain, Bone mark woven into the flow. */
const FS = `precision highp float;
uniform float t,lvl,focus,wob,glow,gsz;uniform vec2 res;
const vec3 k0=vec3(.184,.369,.353);const vec3 k1=vec3(.373,.549,.510);const vec3 k2=vec3(.369,.604,.565);
const vec3 k3=vec3(.247,.710,.651);const vec3 k4=vec3(.369,.847,.784);const vec3 bone=vec3(.961,.957,.941);
float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fb3(vec3 p){float v=0.,a=.55;for(int i=0;i<4;i++){v+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}
mat3 rot(float a,float b){float ca=cos(a),sa=sin(a),cb=cos(b),sb=sin(b);return mat3(ca,0.,-sa,0.,1.,0.,sa,0.,ca)*mat3(1.,0.,0.,0.,cb,sb,0.,-sb,cb);}
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 ramp(float x){x=clamp(x,0.,1.);if(x<.3)return mix(k0,k1,x/.3);if(x<.58)return mix(k1,k2,(x-.3)/.28);if(x<.8)return mix(k2,k3,(x-.58)/.22);return mix(k3,k4,(x-.8)/.2);}
float cr(vec2 u,vec2 v){return u.x*v.y-u.y*v.x;}
float ed(vec2 p,vec2 a,vec2 b,float s){return s*cr(b-a,p-a)/length(b-a);}
float tri(vec2 p,vec2 a,vec2 b,vec2 c){float s=sign(cr(b-a,c-a));return min(min(ed(p,a,b,s),ed(p,b,c,s)),ed(p,c,a,s));}
float mark(vec2 m){float d=tri(m,vec2(0,0),vec2(160,100),vec2(0,200));
d=max(d,tri(m,vec2(160,100),vec2(320,200),vec2(160,300)));d=max(d,tri(m,vec2(0,200),vec2(160,300),vec2(0,400)));
d=max(d,tri(m,vec2(160,300),vec2(320,400),vec2(160,500)));d=max(d,tri(m,vec2(0,400),vec2(160,500),vec2(0,600)));return d;}
void main(){vec2 uv=(gl_FragCoord.xy/res)*2.-1.;float r=length(uv);
float z=sqrt(max(0.,1.-r*r));vec3 N=vec3(uv,z);
vec3 P=rot(t*.32,t*.13+.6)*N*1.45;
vec3 q=vec3(fb3(P+vec3(0.,0.,t*.22)),fb3(P+vec3(5.2,1.3,2.1)-t*.17),fb3(P+vec3(2.4,7.7,4.4)+t*.12));
float f=fb3(P+(1.9+lvl*.8)*q);
vec3 L=normalize(vec3(-.45,.55,.7));float dif=clamp(dot(N,L),0.,1.);
float tone=smoothstep(.2,.85,f*1.25-.12)*.75+dif*.35-.15+lvl*.1;
vec3 col=ramp(tone);
float H=.74,W=H*320./600.;
vec2 mu=uv+(q.yz-.5)*wob;
vec2 m=vec2((mu.x+W*.5)/W*320.,(H*.5-mu.y)/H*600.);
float dm=mark(m);float msk=smoothstep(-8.,8.,dm);
float rim=smoothstep(-24.,-4.,dm)*(1.-msk);
col=mix(col,col*.7,rim*.3);
float vis=mix(mix(.55,.8,smoothstep(.35,.7,q.y)),1.,focus);
col=mix(col,bone*(.95+.1*(f-.5)),msk*vis);
col+=msk*glow*.1;
col*=mix(.72,1.,smoothstep(0.,.55,z));
col=mix(col,k0*.9,smoothstep(.62,1.,r)*.55);
col+=.14*k4*smoothstep(.9,.975,r)*smoothstep(1.,.975,r)*clamp(dot(normalize(uv+1e-5),vec2(-.6,.8))*.5+.6,0.,1.);
col+=(.02+glow*.06)*pow(dif,6.);
col+=(h2(floor((uv*.5+.5)*gsz))-.5)*.07;
float a=smoothstep(1.,.985,r);gl_FragColor=vec4(col*a,a);}`;

/**
 * Bani orb: 3D rolling smoke sphere (petrol -> sage -> aqua glow) with the Bone Bani mark woven into
 * the smoke. Idle: lively flow, mark subtle. Listening: swells and swirls with the mic level.
 * Thinking: slows and gathers into the mark. Speaking: energetic flow, mark in full focus.
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
        gl.uniform1f(gl.getUniformLocation(prog, "gsz"), Math.max(40, size * 1.15));
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
      if (!reduced) t += dt * cur.sp * (1 + lv * 0.8);
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
          ? "radial-gradient(circle at 32% 28%, #5ED8C8 0%, #3FB5A6 22%, #5E9A90 48%, #5F8C82 74%, #2F5E5A 100%)"
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
          fill="#F5F4F0"
        >
          {BANI_MARK_PATHS.map((d) => <path key={d} d={d} />)}
        </svg>
      )}
    </span>
  );
}

export default BaniOrb;
