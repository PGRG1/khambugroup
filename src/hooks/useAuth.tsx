import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import {
  clearStoredAuthTokens,
  initialAuthSessionState,
  reduceAuthSession,
  type AuthSessionAction,
  type AuthSessionState,
} from "@/utils/authSessionState";

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
  // Single authoritative auth-state machine shared by both producers
  // (initial getSession + onAuthStateChange), so neither can regress the other.
  const authStateRef = useRef<AuthSessionState<Session>>(initialAuthSessionState as AuthSessionState<Session>);

  useEffect(() => {
    let cancelled = false;

    const dispatch = (action: AuthSessionAction<Session>) => {
      if (cancelled) return;
      const { state, effects } = reduceAuthSession(authStateRef.current, action);
      const prev = authStateRef.current;
      authStateRef.current = state;
      if (effects.clearStoredTokens) clearStoredAuthTokens();
      if (state.session !== prev.session) setSession(state.session);
      if (!state.loading) setLoading(false);
    };

    // Auth events are authoritative and registered first.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      dispatch({ type: "auth_event", event, session: s });
    });

    // Initial session read; a stale/failed result can never overwrite an event.
    supabase.auth
      .getSession()
      .then(({ data: { session: s }, error }) => {
        if (error) dispatch({ type: "initial_error", error });
        else dispatch({ type: "initial_session", session: s });
      })
      .catch((error) => dispatch({ type: "initial_error", error }));

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
