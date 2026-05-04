import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Shield,
  BarChart3,
  ShoppingCart,
  DollarSign,
  Activity,
  User as UserIcon,
} from "lucide-react";
import baniLogo from "@/assets/bani-logo.png";
import authHero from "@/assets/auth-hero.jpg";

const features = [
  { icon: BarChart3, title: "Revenue Intelligence", desc: "Monitor performance and uncover growth opportunities." },
  { icon: ShoppingCart, title: "Procurement Excellence", desc: "Optimize spend and manage supplier relationships." },
  { icon: DollarSign, title: "Financial Clarity", desc: "Real-time insights into financial health and forecasts." },
  { icon: Activity, title: "Cash Flow Control", desc: "Keep liquidity strong and your future ready." },
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

  const BrandHeader = (
    <div className="flex items-center gap-2.5">
      <img src={baniLogo} alt="Bani" width={36} height={36} className="h-9 w-9" />
      <span className="font-display text-xl font-bold tracking-tight text-foreground">Bani</span>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-background lg:grid lg:grid-cols-[1.1fr_1fr] xl:grid-cols-[1.25fr_1fr]">
      {/* LEFT — Brand panel (desktop only) */}
      <aside className="relative hidden lg:flex flex-col overflow-hidden">
        <img
          src={authHero}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background/92 via-background/70 to-primary/15" />
        <div
          className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full opacity-40 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.5), transparent 70%)" }}
        />

        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {BrandHeader}

          <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full">
            <h1 className="font-display text-4xl xl:text-5xl 2xl:text-6xl font-bold tracking-tight text-foreground leading-[1.05]">
              Welcome to <span className="text-primary">Bani</span>
            </h1>
            <div className="mt-4 h-1 w-16 rounded-full bg-primary" />
            <p className="mt-6 text-lg xl:text-xl font-medium text-primary">
              Operational intelligence for revenue, procurement, finance, and cash flow.
            </p>
            <p className="mt-3 text-base text-muted-foreground max-w-md">
              Access your workspace and continue managing performance with clarity and control.
            </p>

            <ul className="mt-8 space-y-4">
              {features.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Bani. All rights reserved.</p>
        </div>
      </aside>

      {/* RIGHT — Form panel */}
      <main className="relative flex min-h-screen flex-col bg-background">
        {/* Mobile/tablet brand banner with hero image */}
        <div className="relative lg:hidden overflow-hidden">
          <img
            src={authHero}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/60 to-background" />
          <div className="relative z-10 px-6 pt-8 pb-10 sm:px-10">
            {BrandHeader}
            <div className="mt-6 max-w-lg">
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.1]">
                Welcome to <span className="text-primary">Bani</span>
              </h1>
              <div className="mt-3 h-1 w-12 rounded-full bg-primary" />
              <p className="mt-4 text-base sm:text-lg font-medium text-primary">
                Operational intelligence for revenue, procurement, finance, and cash flow.
              </p>
            </div>
          </div>
        </div>

        {/* Form area */}
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:p-10">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-border bg-card shadow-xl p-6 sm:p-8 lg:p-10">
              <div className="mb-6">
                <h2 className="font-display text-2xl font-bold text-foreground">
                  {isLogin ? "Sign In" : "Create Account"}
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

            <div className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-card/50 px-4 py-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                <Shield className="h-4 w-4" />
              </span>
              <div className="text-sm min-w-0">
                <p className="font-semibold text-foreground">Secure access — Enterprise-grade security.</p>
                <p className="text-muted-foreground">Your data is protected.</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>Powered by</span>
              <img src={baniLogo} alt="" width={16} height={16} className="h-4 w-4" />
              <span className="font-semibold text-foreground">Bani</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Auth;
