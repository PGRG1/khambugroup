import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff } from "lucide-react";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";
import { AuthEntrance } from "@/components/brand/AuthEntrance";
import { TeamAvatar } from "@/components/team/TeamAvatar";
import { ROLES } from "@/pages/YourTeam";
import "./auth.css";


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

  const markRef = useRef<SVGSVGElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [entranceDone, setEntranceDone] = useState(reducedMotion);
  const [brandVisible, setBrandVisible] = useState(reducedMotion);
  const handleHandoff = useCallback(() => setBrandVisible(true), []);
  const handleFinish = useCallback(() => setEntranceDone(true), []);


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
    try { localStorage.removeItem("khambu.enteredTenantId"); } catch { /* no-op */ }
    // Demo username alias: "Demo" signs in to the isolated YC demo account.
    const login = email.trim().toLowerCase() === "demo" ? "demo@usebani.com" : email.trim();
    const { data, error } = await supabase.auth.signInWithPassword({ email: login, password });
    if (error) {
      setError(error.message);
    } else if (!data?.session) {
      // No session means we are not signed in — never navigate to a protected route.
      setError("Sign in did not complete. Please try again.");
    }
    // Navigation is driven solely by the session-driven effect above, so we never
    // land on a protected route before AuthProvider exposes the new session.
    setLoading(false);
  };

  // Hold the rotating team member still while someone is typing.
  const rotRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [holdIndex, setHoldIndex] = useState<number | null>(null);
  const onFormFocus = () => {
    if (holdIndex !== null || !rotRef.current) return;
    let best = 0, bestOpacity = -1;
    Array.from(rotRef.current.children).forEach((el, i) => {
      const o = parseFloat(getComputedStyle(el).opacity);
      if (o > bestOpacity) { bestOpacity = o; best = i; }
    });
    setHoldIndex(best);
  };
  const onFormBlur = () => {
    window.setTimeout(() => {
      if (formRef.current && !formRef.current.contains(document.activeElement)) setHoldIndex(null);
    }, 0);
  };

  return (
    <div className="bani-login">
      <div className="bl-page">
        <header className="bl-hd">
          <div className="bl-logo" style={{ opacity: brandVisible ? 1 : 0 }}>
            <BaniLoginMark svgRef={markRef} className="bl-mark" />
            <span ref={wordRef} className="bl-word">Bani</span>
          </div>
        </header>

        <div className="bl-core">
          <section className="bl-msg">
            <h1 className="bl-h1">Your restaurant&rsquo;s<br />finance team.</h1>
            <div
              ref={rotRef}
              className={`bl-rot${holdIndex !== null ? " hold" : ""}`}
              aria-label={`Your team: ${ROLES.map((r) => r.title).join(", ")}`}
            >
              {ROLES.map((r, i) => (
                <div
                  key={r.key}
                  className={`bl-ri${holdIndex === i ? " on" : ""}`}
                  style={{ animationDelay: `${i * 3.2}s` }}
                  aria-hidden="true"
                >
                  <TeamAvatar role={r.key} tile className="bl-av" />
                  <span className="bl-rx"><b>{r.title}</b><span>{r.sub}</span></span>
                </div>
              ))}
            </div>
          </section>

          <section className="bl-act">
            <h2 className="bl-h2">Sign in</h2>
            <form ref={formRef} onSubmit={handleSubmit} onFocus={onFormFocus} onBlur={onFormBlur} className="bl-form">
              <div className="bl-fl">
                <input
                  id="auth-email"
                  type="text"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=" "
                />
                <label htmlFor="auth-email">Email or username</label>
              </div>

              <div className="bl-fl">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=" "
                />
                <label htmlFor="auth-password">Password</label>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="bl-eye"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="bl-row">
                <label>
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  Remember me
                </label>
                <button type="button" onClick={handleForgotPassword} className="bl-link">
                  Forgot password?
                </button>
              </div>

              {error && <p className="bl-error" role="alert">{error}</p>}
              {message && <p className="bl-msgtext" role="status">{message}</p>}

              <button type="submit" disabled={loading} className="bl-go">
                {loading ? "Please wait..." : "Sign in"}
              </button>
            </form>
          </section>
        </div>

        <div className="bl-space" />
        <footer className="bl-foot">© {new Date().getFullYear()} Bani Technology Limited</footer>
      </div>

      {!entranceDone && (
        <AuthEntrance
          markRef={markRef}
          wordRef={wordRef}
          onHandoff={handleHandoff}
          onFinish={handleFinish}
        />
      )}
    </div>

  );
};

export default Auth;
