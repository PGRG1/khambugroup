import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Shield, User as UserIcon,
  BarChart3, ShoppingCart, DollarSign, Activity,
} from "lucide-react";
import baniLogo from "@/assets/bani-logo.png";
import authHero from "@/assets/auth-hero.jpg";

const features = [
  { icon: BarChart3, title: "Revenue Intelligence", desc: "Real-time visibility across every venue." },
  { icon: ShoppingCart, title: "Procurement Excellence", desc: "Control costs from invoice to plate." },
  { icon: DollarSign, title: "Financial Clarity", desc: "Profit & Loss, cash flow, and margins at a glance." },
  { icon: Activity, title: "Operational Insight", desc: "Decisions grounded in clean, trusted data." },
];

const Auth = () => {
  const { session, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else navigate("/");
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { display_name: displayName || email },
        },
      });
      if (error) setError(error.message);
      else setMessage("Check your email for a confirmation link before signing in.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-full bg-background lg:grid lg:grid-cols-[1.15fr_1fr] xl:grid-cols-[1.3fr_1fr]">
      {/* LEFT — Brand panel (desktop) */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-10 xl:p-14 2xl:p-16 text-white">
        {/* Background image */}
        <img
          src={authHero}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        {/* Gradient overlays for legibility */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1733]/95 via-[#0a1733]/75 to-[#0a1733]/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1733]/80 via-transparent to-transparent" />
        {/* Subtle warm glow */}
        <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-[#c98756]/20 blur-3xl" />

        {/* Top: Logo + wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur ring-1 ring-white/20">
            <img src={baniLogo} alt="Bani" className="h-9 w-9 object-contain" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-2xl font-bold tracking-tight">Bani</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-white/60">Operational Intelligence</span>
          </div>
        </div>

        {/* Middle: Headline + features */}
        <div className="relative z-10 max-w-lg space-y-8">
          <div>
            <h1 className="font-display text-4xl xl:text-5xl 2xl:text-6xl font-bold leading-[1.05] tracking-tight">
              Run your venues with <span className="text-[#e8a878]">clarity.</span>
            </h1>
            <p className="mt-5 text-base xl:text-lg text-white/70 leading-relaxed">
              The intelligence layer for modern hospitality groups — revenue, procurement, finance and cash flow, unified.
            </p>
          </div>

          <ul className="space-y-3.5">
            {features.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 backdrop-blur">
                  <Icon className="h-4 w-4 text-[#e8a878]" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-sm text-white/60">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom: Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-white/50">
          <span>© {new Date().getFullYear()} Bani. All rights reserved.</span>
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Enterprise-grade security
          </span>
        </div>
      </aside>

      {/* RIGHT — Form panel */}
      <main className="relative flex min-h-screen flex-col bg-background">
        {/* Mobile/tablet brand banner */}
        <div className="relative lg:hidden overflow-hidden border-b border-border">
          <img
            src={authHero}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a1733]/95 via-[#0a1733]/80 to-[#0a1733]/60" />
          <div className="relative z-10 flex flex-col gap-3 px-6 py-8 sm:px-8 sm:py-10 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20 backdrop-blur">
                <img src={baniLogo} alt="Bani" className="h-7 w-7 object-contain" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight">Bani</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
              Run your venues with <span className="text-[#e8a878]">clarity.</span>
            </h1>
            <p className="text-sm text-white/70 max-w-md">
              Revenue, procurement, finance and cash flow — unified.
            </p>
          </div>
        </div>

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:p-10">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-border bg-card shadow-xl p-6 sm:p-8 lg:p-10">
              <div className="mb-6">
                <h2 className="font-display text-2xl font-bold text-foreground">
                  {isLogin ? "Welcome back" : "Create your account"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isLogin ? "Sign in to continue to your workspace." : "Set up your account to get started."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Display Name
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full pl-10 pr-3 h-11 rounded-lg border border-input bg-background text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
                        placeholder="Your name"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3 h-11 rounded-lg border border-input bg-background text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 h-11 rounded-lg border border-input bg-background text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {isLogin && (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                      />
                      Remember me
                    </label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}
                {message && <p className="text-sm text-primary">{message}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="group w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:opacity-90 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
                  {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <p className="text-sm text-muted-foreground text-center">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  onClick={() => { setIsLogin(!isLogin); setError(""); setMessage(""); }}
                  className="text-primary font-semibold hover:underline"
                >
                  {isLogin ? "Sign Up" : "Sign In"}
                </button>
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>Powered by</span>
              <img src={baniLogo} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
              <span className="font-semibold text-foreground">Bani</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Auth;
