import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";

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
    "w-full px-3.5 h-11 rounded-md border border-bone/15 bg-bone/[0.03] text-bone text-sm font-inter placeholder:text-bone/25 focus-visible:outline-none focus-visible:border-sage/70 focus-visible:ring-1 focus-visible:ring-sage/40 transition";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-carbon text-bone">
      {/* Technical grid */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]">
        <defs>
          <pattern id="bani-grid" width="102" height="51" patternUnits="userSpaceOnUse">
            <path d="M102 0H0V51" fill="none" stroke="hsl(var(--sage))" strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bani-grid)" />
      </svg>
      {/* Deep green wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(80% 60% at 20% 20%, hsl(var(--sage) / 0.07), transparent 70%)" }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-5 sm:px-8 lg:pl-[70px] lg:pr-[107px]">
        {/* Header row: logo + stage blocks share one line */}
        <header className="flex shrink-0 items-center gap-0 border-b border-bone/10 py-6 lg:pb-4 lg:pt-[47px]">
          <div className="flex items-center gap-4 pr-8 lg:pr-14">
            <BaniLoginMark className="h-9 w-[22px] text-bone lg:h-[58px] lg:w-[31px]" />
            <span className="font-geist text-2xl font-light tracking-tight text-bone lg:text-[28px]">Bani</span>
          </div>
          <div className="hidden md:flex">
            {RAIL.map((r) => (
              <div
                key={r.k}
                className="border-l border-bone/12 px-5 lg:px-7 font-plex text-[10px] leading-[1.9] tracking-[0.16em]"
              >
                <div className="text-bone/75">{r.k}</div>
                <div className="text-bone/35">{r.v}</div>
              </div>
            ))}
          </div>
        </header>

        {/* Main */}
        <main className="relative grid flex-1 items-center gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_300px_477px] lg:items-start lg:gap-0 lg:py-0">
          {/* Row numbers aligned to grid rows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-[20px] top-[27px] hidden flex-col font-plex text-[10px] tracking-widest text-bone/20 xl:flex"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="flex h-[51px] items-center">
                {String(i + 1).padStart(2, "0")}
              </span>
            ))}
          </div>

          {/* Headline */}
          <section className="lg:pl-8 xl:pl-16 lg:pt-[181px]">
            <h1 className="font-geist text-4xl font-light leading-[1.06] tracking-tight sm:text-5xl xl:text-[64px]">
              Your restaurant&rsquo;s
              <span className="block">finance team.</span>
              <span className="block text-sage/85 xl:whitespace-nowrap">Without the headcount.</span>
            </h1>
          </section>

          {/* Central tall geometric construction */}
          <svg
            aria-hidden="true"
            viewBox="0 0 320 600"
            preserveAspectRatio="xMidYMid meet"
            className="hidden h-[600px] w-full text-sage/25 lg:block"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          >
            <path d="M0 0 L160 100 L0 200 Z" />
            <path d="M160 100 L320 200 L160 300 Z" />
            <path d="M0 200 L160 300 L0 400 Z" />
            <path d="M160 300 L320 400 L160 500 Z" />
            <path d="M0 400 L160 500 L0 600 Z" />
            <path d="M160 0 L160 600" opacity="0.5" />
          </svg>

          {/* Glass form panel */}
          <section className="w-full lg:justify-self-end lg:pt-12">
            <div
              className="rounded-xl border border-sage/20 bg-bone/[0.04] px-7 pb-14 pt-9 backdrop-blur-xl sm:px-10 sm:pb-[64px] sm:pt-[60px]"
              style={{ boxShadow: "0 0 0 1px hsl(var(--bone) / 0.04), 0 24px 60px -30px hsl(var(--sage) / 0.35), 0 0 40px -20px hsl(var(--sage) / 0.4)" }}
            >
              <div className="mb-12">
                <h2 className="font-geist text-2xl font-light tracking-tight text-bone">Welcome back</h2>

                <p className="mt-1.5 font-inter text-sm text-bone/45">
                  Sign in to continue to your workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="auth-email" className="mb-1.5 block font-plex text-[11px] uppercase tracking-[0.12em] text-bone/40">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="auth-password" className="mb-1.5 block font-plex text-[11px] uppercase tracking-[0.12em] text-bone/40">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-bone/25 transition hover:text-bone/70 focus-visible:text-sage focus-visible:outline-none"
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
                  className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-sage font-inter text-sm font-medium text-carbon transition hover:bg-sage/85 disabled:opacity-50"
                >
                  {loading ? "Please wait..." : "Sign In"}
                  {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
              </form>
            </div>
          </section>
        </main>

        <footer className="shrink-0 py-8 font-plex text-[11px] tracking-wide text-bone/25">
          © {new Date().getFullYear()} Bani Technology Limited
        </footer>
      </div>
    </div>
  );
};

export default Auth;
