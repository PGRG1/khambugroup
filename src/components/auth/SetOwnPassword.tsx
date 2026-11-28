import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// First sign-in with a temporary password (added or reset by a manager or Bani): the person must set their own
// password before using Bani. A temporary password older than 7 days is refused; they ask for a new one.
const WEEK = 7 * 24 * 60 * 60 * 1000;
export const needsOwnPassword = (s: Session | null) => !!s?.user?.user_metadata?.must_set_password;

export function SetOwnPassword({ session }: { session: Session }) {
  const meta = session.user.user_metadata ?? {};
  const name = String(meta.display_name ?? "").split(" ")[0];
  const setAt = Date.parse(String(meta.temp_password_set_at ?? ""));
  const expired = Number.isFinite(setAt) && Date.now() - setAt > WEEK;
  const [pw, setPw] = useState(""), [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false), [showAgain, setShowAgain] = useState(false);
  const mismatch = again.length > 0 && again !== pw;
  const save = async () => {
    if (pw.length < 8 || pw !== again) return;
    setBusy(true); setError("");
    const { error: e } = await supabase.auth.updateUser({ password: pw, data: { must_set_password: false, temp_password: null, temp_password_set_at: null } });
    setBusy(false);
    if (e) setError(e.message.includes("different") ? "Pick a password different from the temporary one." : e.message);
  };
  const email = session.user.email ?? "";
  const field = (label: string, value: string, set: (v: string) => void, shown: boolean, toggle: () => void, first = false) =>
    <label className="mt-4 block text-[13px] text-foreground">{label}
      <span className="mt-1.5 flex h-11 items-center rounded-lg border border-[#C9D3CF] bg-white pr-3 focus-within:border-[#1F3F3B]">
        <input type={shown ? "text" : "password"} autoComplete="new-password" autoFocus={first} value={value} onChange={(e) => set(e.target.value)}
          className="h-full min-w-0 flex-1 rounded-lg bg-transparent px-3 text-[15px] outline-none" />
        <button type="button" className="shrink-0 text-[12.5px] underline underline-offset-4" onClick={toggle}>{shown ? "Hide" : "Show"}</button>
      </span></label>;
  const tick = (ok: boolean, text: string) => <span className={ok ? "text-[#1F6B5E]" : "text-muted-foreground"}>{ok ? "✓ " : ""}{text}</span>;
  const ready = pw.length >= 8 && pw === again;
  const signOut = <button type="button" className="mx-auto mt-auto pt-8 text-[13.5px] text-muted-foreground underline underline-offset-4" onClick={() => void supabase.auth.signOut()}>Sign out</button>;
  // Plain white page, full width on a phone; no logo. The username field lets password managers update the saved
  // login to the new password instead of keeping the temporary one.
  return <div className="flex min-h-svh flex-col bg-white px-6 pb-6 pt-14 text-[#1a1a1a] sm:items-center sm:justify-center sm:pt-6">
    <div className="flex w-full max-w-[400px] flex-1 flex-col sm:flex-none">
      {expired ? <>
        <h1 className="text-[22px] font-semibold">Temporary password expired</h1>
        <p className="mt-1.5 text-[14px] text-muted-foreground">It was valid for 7 days. Ask your manager for a new one.</p>
        {signOut}
      </> : <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h1 className="text-[22px] font-semibold">Set your password</h1>
        <p className="mt-1.5 text-[14px] leading-snug text-muted-foreground">{name ? `${name}, this` : "This"} replaces the temporary password.{email && <><br />Signed in as {email}</>}</p>
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        {field("New password", pw, setPw, showPw, () => setShowPw(v => !v), true)}
        {field("Type it again", again, setAgain, showAgain, () => setShowAgain(v => !v))}
        <p className="mt-2.5 flex flex-wrap gap-x-4 text-[13px]">{tick(pw.length >= 8, "At least 8 characters")}{tick(again.length > 0 && pw === again, mismatch ? "Passwords differ" : "Both match")}</p>
        {error && <p className="mt-2 text-[13px] text-[#B45309]" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !ready} className="mt-6 h-[46px] w-full rounded-lg bg-[#1F3F3B] text-[15px] font-medium text-white disabled:opacity-60">{busy ? "Saving…" : "Save and continue"}</button>
        {signOut}
      </form>}
    </div>
  </div>;
}
