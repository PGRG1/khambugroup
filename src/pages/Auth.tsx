import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import baniLogo from "@/assets/bani-logo.png";

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
    "w-full pl-10 pr-3 h-11 rounded-md border border-carbon/15 bg-transparent text-carbon text-sm font-inter placeholder:text-carbon/35 focus-visible:outline-none focus-visible:border-sage focus-visible:ring-1 focus-visible:ring-sage transition";

  return (
    <div className="min-h-screen w-full bg-bone lg:grid lg:grid-cols-[1.15fr_1fr] xl:grid-cols-[1.25fr_1fr]">
      {/* LEFT — Brand panel (desktop) */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-carbon p-10 xl:p-14 2xl:p-16 text-bone">
        {/* Quiet geometric lattice */}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]">
          <defs>
            <pattern id="bani-lattice" width="72" height="72" patternUnits="userSpaceOnUse">
              <path d="M72 0H0V72" fill="none" stroke="hsl(var(--bone))" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bani-lattice)" />
        </svg>
        {/* Oversized logo mark, very low opacity */}
        <img
          src={baniLogo}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-20 h-[520px] w-[520px] object-contain opacity-[0.05]"
        />

        <div className="relative z-10 flex items-center gap-3">
          <img src={baniLogo} alt="Bani" className="h-8 w-8 object-contain" />
          <span className="font-geist text-2xl font-light tracking-tight">Bani</span>
        </div>

        <div className="relative z-10 max-w-xl">
          <h1 className="font-geist text-5xl xl:text-6xl font-light leading-[1.06] tracking-tight">
            Your restaurant&rsquo;s finance team.
            <span className="block text-sage">Without the headcount.</span>
          </h1>
          <p className="mt-6 max-w-md font-inter text-base leading-relaxed text-bone/60">
            Invoice capture, cost control, payroll and month-to-date margin — run as one finance function.
          </p>
        </div>

        <div className="relative z-10 font-plex text-[11px] tracking-wide text-bone/35">
          © {new Date().getFullYear()} Bani Technology Limited
        </div>
      </aside>

      {/* RIGHT — Form panel */}
      <main className="relative flex min-h-screen flex-col bg-bone">
        {/* Mobile/tablet brand banner */}
        <div className="relative lg:hidden overflow-hidden bg-carbon">
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]">
            <defs>
              <pattern id="bani-lattice-m" width="56" height="56" patternUnits="userSpaceOnUse">
                <path d="M56 0H0V56" fill="none" stroke="hsl(var(--bone))" strokeWidth="0.6" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#bani-lattice-m)" />
          </svg>
          <div className="relative z-10 flex flex-col gap-3 px-6 py-9 sm:px-8 sm:py-11 text-bone">
            <div className="flex items-center gap-2.5">
              <img src={baniLogo} alt="Bani" className="h-7 w-7 object-contain" />
              <span className="font-geist text-xl font-light tracking-tight">Bani</span>
            </div>
            <h1 className="font-geist text-3xl font-light leading-tight tracking-tight">
              Your restaurant&rsquo;s finance team.
              <span className="block text-sage">Without the headcount.</span>
            </h1>
            <p className="max-w-md font-inter text-sm text-bone/60">
              Invoice capture, cost control, payroll and month-to-date margin — run as one finance function.
            </p>
          </div>
        </div>

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:p-12">
          <div className="w-full max-w-md">
            <div className="rounded-lg border border-carbon/10 bg-bone p-7 sm:p-9 lg:p-10">
              <div className="mb-8">
                <h2 className="font-geist text-2xl font-light tracking-tight text-carbon">
                  Welcome back
                </h2>
                <p className="mt-1.5 font-inter text-sm text-carbon/55">
                  Sign in to continue to your workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="mb-1.5 block font-plex text-[11px] uppercase tracking-[0.12em] text-carbon/50">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-carbon/40" />
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
                  <label className="mb-1.5 block font-plex text-[11px] uppercase tracking-[0.12em] text-carbon/50">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-carbon/40" />
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-carbon/40 hover:text-carbon transition"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {isLogin && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 font-inter text-sm text-carbon/60">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 rounded border-carbon/25 accent-sage focus:ring-sage"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="font-inter text-sm text-sage hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {error && <p className="font-inter text-sm text-destructive">{error}</p>}
                {message && <p className="font-inter text-sm text-carbon/70">{message}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-sage font-inter text-sm font-medium text-carbon transition hover:bg-sage/85 disabled:opacity-50"
                >
                  {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
                  {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
              </form>

              <div className="mt-8 border-t border-carbon/10 pt-6">
                <p className="text-center font-inter text-sm text-carbon/55">
                  {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                  <button
                    onClick={() => { setIsLogin(!isLogin); setError(""); setMessage(""); }}
                    className="font-medium text-sage hover:underline"
                  >
                    {isLogin ? "Sign Up" : "Sign In"}
                  </button>
                </p>
              </div>
            </div>

            <p className="mt-6 text-center font-plex text-[11px] tracking-wide text-carbon/35 lg:hidden">
              © {new Date().getFullYear()} Bani Technology Limited
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Auth;
