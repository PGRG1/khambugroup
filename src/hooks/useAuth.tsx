import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  roleLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isAdmin: false,
  loading: true,
  roleLoading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const forceSignOut = async () => {
      try {
        await supabase.auth.signOut();
      } catch {}
      try {
        // Clear any stale supabase auth keys from localStorage
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
      if (!cancelled) {
        setSession(null);
        setLoading(false);
      }
    };

    // Get initial session; if refresh fails, clean up the stale token
    supabase.auth
      .getSession()
      .then(({ data: { session: s }, error }) => {
        if (cancelled) return;
        const msg = (error as any)?.message?.toLowerCase?.() ?? "";
        if (error && (msg.includes("refresh") || msg.includes("token"))) {
          forceSignOut();
          return;
        }
        setSession(s);
        setLoading(false);
      })
      .catch(() => forceSignOut());

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        if (cancelled) return;
        if ((event === "TOKEN_REFRESHED" || event === "SIGNED_OUT") && !s) {
          forceSignOut();
          return;
        }
        setSession(s);
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Auto-logout after 30 minutes of inactivity
  useEffect(() => {
    if (!session) return;
    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await supabase.auth.signOut();
        setSession(null);
        setIsAdmin(false);
      }, IDLE_MS);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session?.user?.id]);

  // Check admin role separately when session changes
  useEffect(() => {
    if (!session?.user) {
      setIsAdmin(false);
      setRoleLoading(false);
      return;
    }

    let cancelled = false;
    setRoleLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .then(({ data, error }) => {
        if (!cancelled) {
          setIsAdmin(!error && !!(data && data.length > 0));
          setRoleLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    try {
      localStorage.removeItem("khambu.enteredTenantId");
      localStorage.removeItem("khambu.activeTenantId");
      localStorage.removeItem("khambu.homeTenantId");
    } catch {}
    setSession(null);
    setIsAdmin(false);
    setRoleLoading(false);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, isAdmin, loading, roleLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
