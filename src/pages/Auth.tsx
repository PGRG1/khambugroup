import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import baniLogo from "@/assets/bani-logo.png";

const RAIL = [
  { k: "CAPTURE", v: "OPERATING DATA" },
  { k: "PROCESS", v: "FINANCIAL WORKFLOWS" },
  { k: "INTELLIGENCE", v: "LIVE SIGNALS" },
  { k: "ACT", v: "CLEAR PRIORITIES" },
];

const Auth = () => {
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && session) navigate("/", { replace: true });
  }, [session, authLoading, navigate]);

  const handleForgotPassword = async () => {
    if (!email) { setError("Enter your email first"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) setError(error.message);
    else setMessage("Password reset email sent. Check your inbox.");
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else navigate("/");
    setLoading(false);
  };

  const inputClass =
    "w-full pl-10 pr-3 h-11 rounded-md border border-bone/15 bg-bone/[0.03] text-bone text-sm font-inter placeholder:text-bone/25 focus-visible:outline-none focus-visible:border-sage/70 focus-visible:ring-1 focus-visible:ring-sage/40 transition";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-carbon text-bone">
      {/* Technical grid */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]">
        <defs>
          <pattern id="bani-grid" width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M64 0H0V64" fill="none" stroke="hsl(var(--sage))" strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bani-grid)" />
      </svg>
      {/* Deep green wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(80% 60% at 20% 20%, hsl(var(--sage) / 0.08), transparent 70%)" }}
      />

      {/* Row numbers 01–12 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 hidden flex-col justify-between py-24 font-plex text-[10px] tracking-widest text-bone/15 xl:flex"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i}>{String(i + 1).padStart(2, "0")}</span>
        ))}
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-5 sm:px-8 lg:px-14 xl:px-20">
        {/* Header */}
        <header className="flex shrink-0 items-center gap-3 pt-8 lg:pt-10">
          <img src={baniLogo} alt="Bani" className="h-7 w-7 object-contain" />
          <span className="font-geist text-xl font-light tracking-tight text-bone">Bani</span>
        </header>

        {/* Top rail */}
        <div className="mt-6 hidden shrink-0 border-y border-bone/10 py-3 md:grid md:grid-cols-4">
          {RAIL.map((r, i) => (
            <div
              key={r.k}
              className={`flex items-baseline gap-2 px-4 font-plex text-[10px] tracking-[0.18em] ${i > 0 ? "border-l border-bone/10" : "pl-0"}`}
            >
              <span className="text-bone/70">{r.k}</span>
              <span className="text-bone/30">/</span>
              <span className="text-bone/35">{r.v}</span>
            </div>
          ))}
        </div>

        {/* Main */}
        <main className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.15fr_minmax(380px,440px)] lg:gap-20 lg:py-16 xl:gap-28">
          {/* Left */}
          <section className="flex flex-col gap-10">
            <h1 className="font-geist text-4xl font-light leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl">
              Your restaurant&rsquo;s
              <span className="block">finance team.</span>
              <span className="block text-sage/80">Without the headcount.</span>
            </h1>

            {/* Geometric construction */}
            <svg
              aria-hidden="true"
              viewBox="0 0 420 220"
              className="hidden h-auto w-full max-w-[460px] text-sage/40 md:block"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.9"
              strokeLinejoin="round"
            >
              <path d="M210 20 L400 200 L20 200 Z" />
              <path d="M210 20 L210 200" opacity="0.5" />
              <path d="M115 110 L305 110" opacity="0.5" />
              <path d="M115 110 L210 200 L305 110" />
              <path d="M162 155 L258 155" opacity="0.35" />
              <path d="M67 155 L353 155" opacity="0.2" />
              <circle cx="210" cy="20" r="2.5" />
              <circle cx="20" cy="200" r="2.5" />
              <circle cx="400" cy="200" r="2.5" />
              <circle cx="210" cy="110" r="1.8" opacity="0.6" />
            </svg>
          </section>

          {/* Right — glass form panel */}
          <section className="w-full">
            <div
              className="rounded-xl border border-sage/20 bg-bone/[0.04] px-7 pb-16 pt-9 backdrop-blur-xl sm:px-9 sm:pb-[60px] sm:pt-10"
              style={{ boxShadow: "0 0 0 1px hsl(var(--bone) / 0.04), 0 24px 60px -30px hsl(var(--sage) / 0.35), 0 0 40px -20px hsl(var(--sage) / 0.4)" }}
            >
              <div className="mb-8">
                <h2 className="font-geist text-2xl font-light tracking-tight text-bone">Welcome back</h2>
                <p className="mt-1.5 font-inter text-sm text-bone/45">
                  Sign in to continue to your workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block font-plex text-[11px] uppercase tracking-[0.12em] text-bone/40">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bone/30" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block font-plex text-[11px] uppercase tracking-[0.12em] text-bone/40">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bone/30" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClass} pr-10`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-bone/25 transition hover:text-bone/70 focus-visible:outline-none focus-visible:text-sage"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 font-inter text-sm text-bone/55">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-bone/25 bg-transparent accent-sage focus:ring-sage"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="font-inter text-sm text-sage/90 transition hover:text-sage hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                {error && <p className="font-inter text-sm text-destructive">{error}</p>}
                {message && <p className="font-inter text-sm text-bone/70">{message}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-sage font-inter text-sm font-medium text-carbon transition hover:bg-sage/85 disabled:opacity-50"
                >
                  {loading ? "Please wait..." : "Sign In"}
                  {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
              </form>
            </div>
          </section>
        </main>

        <footer className="shrink-0 border-t border-bone/10 py-6 font-plex text-[11px] tracking-wide text-bone/25">
          © {new Date().getFullYear()} Bani Technology Limited
        </footer>
      </div>
    </div>
  );
};

export default Auth;
