/**
 * Single source of truth for auth session state transitions.
 *
 * Two producers race at startup: the one-shot `getSession()` result and the
 * `onAuthStateChange` stream. Auth events (SIGNED_IN / TOKEN_REFRESHED) are
 * authoritative and must never be overwritten by a slower or failed
 * `getSession()` result — that race is what produced the /auth <-> / loop.
 *
 * Pure functions only: no Supabase calls, no React, so the behaviour is testable.
 */

export interface AuthSessionLike {
  user?: { id?: string } | null;
  [key: string]: unknown;
}

export interface AuthSessionState<S = AuthSessionLike> {
  session: S | null;
  /** True once the initial resolution finished; loading ends exactly once. */
  initialized: boolean;
  loading: boolean;
  /** True once an auth event (or SIGNED_OUT) has spoken — it wins over getSession. */
  authoritative: boolean;
}

export interface AuthSessionEffects {
  /** Remove stale `sb-*-auth-token` entries. Only for a real invalid-token condition. */
  clearStoredTokens: boolean;
  /** Never true: SIGNED_OUT must not call signOut() again (recursion guard). */
  callSignOut: boolean;
}

export type AuthSessionAction<S = AuthSessionLike> =
  | { type: "initial_session"; session: S | null }
  | { type: "initial_error"; error: unknown }
  | { type: "auth_event"; event: string; session: S | null }
  | { type: "local_sign_out" };

export const initialAuthSessionState: AuthSessionState = {
  session: null,
  initialized: false,
  loading: true,
  authoritative: false,
};

const NO_EFFECTS: AuthSessionEffects = { clearStoredTokens: false, callSignOut: false };

/**
 * Positively identify an invalid / expired refresh-token condition.
 * Generic network, timeout, postMessage-broker and storage failures are NOT
 * this, and must never destroy a valid session.
 */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as { message?: unknown; code?: unknown; name?: unknown; status?: unknown };
  const code = typeof anyErr.code === "string" ? anyErr.code.toLowerCase() : "";
  if (code === "refresh_token_not_found" || code === "invalid_grant" || code === "refresh_token_already_used") {
    return true;
  }
  const msg = typeof anyErr.message === "string" ? anyErr.message.toLowerCase() : "";
  if (!msg) return false;
  if (/network|timeout|timed out|fetch failed|failed to fetch|abort|postmessage|broker|storage|quota/.test(msg)) {
    return false;
  }
  return (
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    msg.includes("refresh_token_not_found") ||
    msg.includes("already used") ||
    (msg.includes("refresh token") && (msg.includes("expired") || msg.includes("revoked") || msg.includes("invalid")))
  );
}

/** Events whose session payload is authoritative and applied immediately. */
const AUTHORITATIVE_EVENTS = new Set(["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "MFA_CHALLENGE_VERIFIED"]);

export function reduceAuthSession<S = AuthSessionLike>(
  state: AuthSessionState<S>,
  action: AuthSessionAction<S>,
): { state: AuthSessionState<S>; effects: AuthSessionEffects } {
  switch (action.type) {
    case "initial_session": {
      // A newer auth event already spoke — never regress to the initial read.
      if (state.authoritative) {
        return { state: { ...state, initialized: true, loading: false }, effects: NO_EFFECTS };
      }
      return {
        state: { session: action.session, initialized: true, loading: false, authoritative: false },
        effects: NO_EFFECTS,
      };
    }

    case "initial_error": {
      const invalid = isInvalidRefreshTokenError(action.error);
      // Transient failures end loading but keep whatever session we have.
      if (state.authoritative || !invalid) {
        return { state: { ...state, initialized: true, loading: false }, effects: NO_EFFECTS };
      }
      return {
        state: { session: null, initialized: true, loading: false, authoritative: false },
        effects: { clearStoredTokens: true, callSignOut: false },
      };
    }

    case "auth_event": {
      const { event, session } = action;

      if (event === "SIGNED_OUT") {
        // Clear React state once. Do NOT call signOut() again from here.
        return {
          state: { session: null, initialized: true, loading: false, authoritative: true },
          effects: NO_EFFECTS,
        };
      }

      if (AUTHORITATIVE_EVENTS.has(event)) {
        if (session) {
          return {
            state: { session, initialized: true, loading: false, authoritative: true },
            effects: NO_EFFECTS,
          };
        }
        // A refresh that yields no session means the stored refresh token is dead.
        if (event === "TOKEN_REFRESHED") {
          return {
            state: { session: null, initialized: true, loading: false, authoritative: true },
            effects: { clearStoredTokens: true, callSignOut: false },
          };
        }
        return { state: { ...state, initialized: true, loading: false }, effects: NO_EFFECTS };
      }

      // INITIAL_SESSION / PASSWORD_RECOVERY and friends: apply a session when we
      // have one, but never blank an existing session with a null payload.
      if (session) {
        return {
          state: { session, initialized: true, loading: false, authoritative: true },
          effects: NO_EFFECTS,
        };
      }
      return { state: { ...state, initialized: true, loading: false }, effects: NO_EFFECTS };
    }

    case "local_sign_out":
      return {
        state: { session: null, initialized: true, loading: false, authoritative: true },
        effects: NO_EFFECTS,
      };

    default:
      return { state, effects: NO_EFFECTS };
  }
}

/** Remove stale supabase auth tokens from localStorage (best effort). */
export function clearStoredAuthTokens(storage?: Storage) {
  try {
    const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    if (!store) return;
    Object.keys(store)
      .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
      .forEach((k) => store.removeItem(k));
  } catch {
    /* storage unavailable — nothing to clean */
  }
}
