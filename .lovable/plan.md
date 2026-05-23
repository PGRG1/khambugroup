## What's happening

The published site loads fine but every page shows empty data. The network log gives the smoking gun:

```
POST /auth/v1/token?grant_type=refresh_token  →  400
{"code":"refresh_token_not_found","message":"Invalid Refresh Token: Refresh Token Not Found"}
```

Your browser still has a saved session in localStorage, but the refresh token on the server has expired or been rotated out. When the Supabase client tries to refresh it, the call fails — so `auth.uid()` is `null` for every database call, and RLS correctly returns zero rows. The UI thinks you're logged in (there's a stale session object), but the database thinks you're a guest. Result: "venues, sales, all gone."

The current `AuthProvider` does not react to this failure, so the user is left in a broken half-logged-in state with no prompt to log in again.

## Immediate workaround (no code needed)

You can unblock yourself right now:

1. Open `https://khambugroup.lovable.app`
2. Hard refresh + clear site data: open DevTools → Application → Storage → **Clear site data** (or in any browser, log out then log back in)
3. Log in again — data will reappear

## Permanent fix (one small change)

Update `src/hooks/useAuth.tsx` so the app recovers automatically when the refresh token is invalid:

1. After the initial `getSession()`, also check for a refresh failure. If `supabase.auth.getSession()` returns a session whose token is expired and refresh fails, call `supabase.auth.signOut()` and clear local state.
2. In `onAuthStateChange`, handle the `TOKEN_REFRESHED` failure case: when an event arrives with no session while a session existed before, treat it as a forced sign-out (clear state, send user to `/auth`).
3. Wrap the existing `user_roles` query in a guard so that if it ever returns an auth error (401), it also triggers `signOut()` instead of silently leaving `isAdmin=false`.

Effect: when the server rejects the refresh token, the user is cleanly bounced to the login screen instead of seeing an empty dashboard.

## Files to touch

- `src/hooks/useAuth.tsx` — add stale-session detection + auto sign-out on refresh failure

That's the entire change. No DB migration, no UI rework.

## Why this is not an RLS / data problem

I checked: your data is fine in the database, RLS is unchanged, and the preview works for you. The only difference between preview and published is which browser session is being used. The published browser has a stale token; the preview browser has a fresh one. That is exactly the fingerprint of this issue.

Approve the plan and I'll apply the `useAuth.tsx` change.
