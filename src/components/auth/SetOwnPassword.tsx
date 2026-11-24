import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const short = pw.length > 0 && pw.length < 8, mismatch = again.length > 0 && again !== pw;
  const save = async () => {
    if (pw.length < 8 || pw !== again) return;
    setBusy(true); setError("");
    const { error: e } = await supabase.auth.updateUser({ password: pw, data: { must_set_password: false, temp_password: null, temp_password_set_at: null } });
    setBusy(false);
    if (e) setError(e.message.includes("different") ? "Pick a password different from the temporary one." : e.message);
  };
  return <div className="flex min-h-svh items-center justify-center bg-[linear-gradient(180deg,#C6DAD2_0px,#DDE9E3_380px,#EDF3EF_900px)] px-4">
    <div className="card-glass w-full max-w-[400px] rounded-xl p-6 sm:p-7">
      <div className="mb-4 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[#1F3F3B] font-semibold text-white" aria-hidden="true">B</div>
      {expired ? <>
        <h1 className="text-[22px] font-semibold">Temporary password expired</h1>
        <p className="mt-1.5 mb-5 text-[13px] text-muted-foreground">It was valid for 7 days. Ask your manager for a new one.</p>
        <Button className="h-[42px] w-full rounded-full" onClick={() => void supabase.auth.signOut()}>Sign out</Button>
      </> : <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h1 className="text-[22px] font-semibold">Set your own password</h1>
        <p className="mt-1.5 mb-5 text-[13px] text-muted-foreground">Welcome{name ? `, ${name}` : ""}. Replace the temporary password before you start.</p>
        <label className="mb-3 block text-[12.5px] text-muted-foreground">New password
          <Input type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 h-10 text-[14px] text-foreground" /></label>
        <label className="block text-[12.5px] text-muted-foreground">Type it again
          <Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="mt-1 h-10 text-[14px] text-foreground" /></label>
        <p className={`mt-2 mb-4 text-[12px] ${short || mismatch || error ? "text-[#B45309]" : "text-muted-foreground"}`} role={error ? "alert" : undefined}>
          {error || (mismatch ? "The two passwords are different" : "At least 8 characters")}</p>
        <Button type="submit" disabled={busy || pw.length < 8 || pw !== again} className="h-[42px] w-full rounded-full">{busy ? "Saving…" : "Save and continue"}</Button>
        <button type="button" className="mt-3 w-full text-[13px] text-muted-foreground" onClick={() => void supabase.auth.signOut()}>Sign out</button>
      </form>}
    </div>
  </div>;
}
