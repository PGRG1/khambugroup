import { describe, expect, it } from "vitest";
import {
  clearStoredAuthTokens,
  initialAuthSessionState,
  isInvalidRefreshTokenError,
  reduceAuthSession,
  type AuthSessionLike,
  type AuthSessionState,
} from "@/utils/authSessionState";

const s1 = { user: { id: "u1" } };
const s2 = { user: { id: "u2" } };

type Action = Parameters<typeof reduceAuthSession<AuthSessionLike>>[1];

const run = (state: AuthSessionState, ...actions: Action[]) => {
  let cur = state;
  let effects = { clearStoredTokens: false, callSignOut: false };
  for (const a of actions) {
    const out = reduceAuthSession(cur, a);
    cur = out.state;
    effects = out.effects;
  }
  return { state: cur, effects };
};

describe("auth session state machine", () => {
  it("successful login is authoritative immediately and does not bounce back", () => {
    const { state } = run(initialAuthSessionState, { type: "auth_event", event: "SIGNED_IN", session: s1 });
    expect(state.session).toBe(s1);
    expect(state.loading).toBe(false);
    expect(state.authoritative).toBe(true);
  });

  it("a stale getSession result cannot overwrite SIGNED_IN", () => {
    const { state } = run(
      initialAuthSessionState,
      { type: "auth_event", event: "SIGNED_IN", session: s1 },
      { type: "initial_session", session: null },
    );
    expect(state.session).toBe(s1);
    expect(state.loading).toBe(false);
  });

  it("a stale getSession result cannot replace a newer session", () => {
    const { state } = run(
      initialAuthSessionState,
      { type: "auth_event", event: "SIGNED_IN", session: s2 },
      { type: "initial_session", session: s1 },
    );
    expect(state.session).toBe(s2);
  });

  it("reload restores a persisted session and ends loading once", () => {
    const first = reduceAuthSession(initialAuthSessionState, { type: "initial_session", session: s1 });
    expect(first.state.session).toBe(s1);
    expect(first.state.loading).toBe(false);
    expect(first.state.initialized).toBe(true);
    // A later refresh still updates the session.
    const second = reduceAuthSession(first.state, { type: "auth_event", event: "TOKEN_REFRESHED", session: s2 });
    expect(second.state.session).toBe(s2);
    expect(second.state.loading).toBe(false);
  });

  it("a transient getSession/storage failure does not erase a valid session", () => {
    const signedIn = reduceAuthSession(initialAuthSessionState, { type: "auth_event", event: "SIGNED_IN", session: s1 });
    for (const error of [
      new Error("Failed to fetch"),
      new Error("network timeout"),
      new Error("postMessage broker unavailable"),
      new Error("storage quota exceeded"),
      { message: "Request timed out" },
    ]) {
      const out = reduceAuthSession(signedIn.state, { type: "initial_error", error });
      expect(out.state.session).toBe(s1);
      expect(out.effects.clearStoredTokens).toBe(false);
      expect(out.state.loading).toBe(false);
    }
    // Same for a fresh boot with no session yet: nothing to clean up.
    const cold = reduceAuthSession(initialAuthSessionState, { type: "initial_error", error: new Error("Failed to fetch") });
    expect(cold.effects.clearStoredTokens).toBe(false);
    expect(cold.state.loading).toBe(false);
  });

  it("cleans up a positively identified invalid refresh token", () => {
    expect(isInvalidRefreshTokenError({ code: "refresh_token_not_found" })).toBe(true);
    expect(isInvalidRefreshTokenError(new Error("Invalid Refresh Token: Refresh Token Not Found"))).toBe(true);
    expect(isInvalidRefreshTokenError(new Error("Failed to fetch"))).toBe(false);
    expect(isInvalidRefreshTokenError(null)).toBe(false);

    const out = reduceAuthSession(initialAuthSessionState, {
      type: "initial_error",
      error: new Error("Invalid Refresh Token: Refresh Token Not Found"),
    });
    expect(out.state.session).toBeNull();
    expect(out.effects.clearStoredTokens).toBe(true);

    const refreshFailed = reduceAuthSession(
      { session: s1, initialized: true, loading: false, authoritative: true },
      { type: "auth_event", event: "TOKEN_REFRESHED", session: null },
    );
    expect(refreshFailed.state.session).toBeNull();
    expect(refreshFailed.effects.clearStoredTokens).toBe(true);
  });

  it("SIGNED_OUT clears state once and never calls signOut again", () => {
    const out = reduceAuthSession(
      { session: s1, initialized: true, loading: false, authoritative: true },
      { type: "auth_event", event: "SIGNED_OUT", session: null },
    );
    expect(out.state.session).toBeNull();
    expect(out.effects.callSignOut).toBe(false);
    expect(out.effects.clearStoredTokens).toBe(false);
    // Idempotent: a repeated SIGNED_OUT changes nothing and still calls nothing.
    const again = reduceAuthSession(out.state, { type: "auth_event", event: "SIGNED_OUT", session: null });
    expect(again.state.session).toBeNull();
    expect(again.effects.callSignOut).toBe(false);
  });

  it("never blanks a valid session on a null non-signout event", () => {
    const out = reduceAuthSession(
      { session: s1, initialized: true, loading: false, authoritative: true },
      { type: "auth_event", event: "INITIAL_SESSION", session: null },
    );
    expect(out.state.session).toBe(s1);
  });

  it("clears only supabase auth token keys from storage", () => {
    const store: Record<string, unknown> = {
      "sb-abc-auth-token": "x",
      "khambu.enteredTenantId": "t",
      other: "y",
    };
    store.removeItem = (k: string) => { delete store[k]; };
    clearStoredAuthTokens(store as unknown as Storage);
    expect(Object.keys(store).filter((k) => k !== "removeItem").sort()).toEqual([
      "khambu.enteredTenantId",
      "other",
    ]);
  });
});
