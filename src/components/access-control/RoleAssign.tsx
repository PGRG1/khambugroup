import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeCreateUser } from "@/utils/invokeCreateUser";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Field, Row, SaveBar, SettingsCard } from "@/components/settings/SettingsForm";
import { AREA_LABEL, LEVEL_SHORT, ROLE_AREAS, legacyPosition, moneyLabel, roleLine, type TenantRole } from "@/utils/roleAccess";

// Settings › People: the operator only picks a role and venues. What each role can do is set by Bani on the
// control plane and shown here read-only.
export type PersonAccess = { role_key: string | null; all_venues: boolean; venue_ids: string[]; status: string };
type Venue = { id: string; name: string };

function RoleCards({ roles, value, onChange, canOwner }: { roles: TenantRole[]; value: string | null; onChange: (k: string) => void; canOwner: boolean }) {
  return <div role="radiogroup" aria-label="Role" className="grid gap-2 sm:grid-cols-2">
    {roles.filter((r) => canOwner || r.role_key !== "owner").map((r) => {
      const on = value === r.role_key;
      return <button key={r.role_key} type="button" role="radio" aria-checked={on} onClick={() => onChange(r.role_key)}
        className={`flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-left ${on ? "bg-white shadow-[0_0_0_1.5px_#1F6B5E]" : "bg-white/50 hover:bg-white/80"}`}>
        <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ${on ? "border-[5px] border-[#1F6B5E]" : "border-[1.5px] border-[#B8C0BB]"}`} />
        <span className="min-w-0"><span className={`block text-[13px] ${on ? "font-semibold" : "font-medium"}`}>{r.name}</span><span className="block truncate text-[12.5px] text-muted-foreground">{roleLine(r)}</span></span>
      </button>;
    })}
  </div>;
}

function VenuePicks({ venues, all, ids, onChange }: { venues: Venue[]; all: boolean; ids: string[]; onChange: (all: boolean, ids: string[]) => void }) {
  const box = "h-4 w-4 accent-[#1F6B5E]";
  return <div className="space-y-0.5">
    <label className="flex min-h-9 items-center gap-2.5 text-[13px]"><input type="checkbox" className={box} checked={all} onChange={(e) => onChange(e.target.checked, ids)} />All venues</label>
    {!all && venues.map((v) => <label key={v.id} className="flex min-h-9 items-center gap-2.5 text-[13px]">
      <input type="checkbox" className={box} checked={ids.includes(v.id)} onChange={(e) => onChange(false, e.target.checked ? [...ids, v.id] : ids.filter((x) => x !== v.id))} />{v.name}</label>)}
  </div>;
}

/** Shown once after adding someone or resetting their password. */
export function TempPasswordCard({ name, email, password, detail, onDone, title }: { name: string; email: string; password: string; detail?: string; onDone: () => void; title?: string }) {
  const first = name.split(" ")[0] || "them";
  // Lovable's preview runs on a long internal address; only show a real sign-in address.
  const host = window.location.host;
  const where = /lovable(project)?\.(app|com)$|^id-preview--|^localhost/.test(host) ? "" : host;
  const message = `Your Bani sign-in${where ? `\n${where}` : ""}\nEmail: ${email}\nTemporary password: ${password}\nYou will set your own password when you sign in. This one stops working after 7 days.`;
  const copy = async () => { try { await navigator.clipboard.writeText(password); toast({ title: "Password copied" }); } catch { toast({ title: "Copy did not work; select the password instead", variant: "destructive" }); } };
  const link = "text-[13px] font-medium text-[#1F6B5E] whitespace-nowrap";
  return <SettingsCard title={title ?? `${name || email} is added`}>
    <p className="text-[13px] text-muted-foreground">{[detail, email].filter(Boolean).join(" · ")}</p>
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-[#F1F6F3] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] text-muted-foreground">Temporary password · works until they set their own, up to 7 days</p>
        <p className="mt-0.5 select-all font-mono text-[20px] tracking-[.1em]" aria-label="Temporary password">{password}</p>
      </div>
      <button type="button" className={link} onClick={() => void copy()}>Copy</button>
      <a className={link} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      <a className={link} href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Your Bani sign-in")}&body=${encodeURIComponent(message)}`}>Email</a>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="text-[13px] text-muted-foreground">{first} {where ? <>signs in at <span className="text-foreground">{where}</span> and </> : ""}sets their own password at first sign-in.</p>
      <button type="button" className="inline-flex h-10 items-center rounded-full bg-[#1F6B5E] px-5 text-[14px] font-medium text-white" onClick={onDone}>Done</button>
    </div>
  </SettingsCard>;
}

/** The server function's own message (supabase-js only says "non-2xx status code"). */
async function fnError(res: { error: any; data: any }): Promise<string | null> {
  if (res.data?.error) return String(res.data.error);
  if (!res.error) return null;
  try { const body = await res.error.context?.json?.(); if (body?.error) return String(body.error); } catch { /* not JSON */ }
  return res.error.message ?? "Something went wrong";
}

async function assign(tenantId: string, userId: string, role: string, all: boolean, ids: string[]) {
  const { error } = await (supabase.rpc as any)("assign_user_role", { t: tenantId, u: userId, k: role, all_v: all, v: all ? [] : ids });
  if (error) { toast({ title: error.message, variant: "destructive" }); return false; }
  return true;
}

/** One person's access: role and venues to pick, what that role can do read-only. */
export function PersonAccessCard({ tenantId, userId, name, email, pending, access, roles, venues, canOwner, onClose, onSaved }: {
  tenantId: string; userId: string; name: string; email: string; pending?: boolean; access?: PersonAccess; roles: TenantRole[]; venues: Venue[]; canOwner: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [temp, setTemp] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [tempTitle, setTempTitle] = useState("Temporary password");
  // reset: a new temporary password; show: the one they still have not replaced.
  const reset = async (action: "reset" | "show" = "reset") => {
    setResetting(true);
    const res = await invokeCreateUser({ action, user_id: userId, tenant_id: tenantId });
    setResetting(false);
    const err = await fnError(res);
    if (err || !res.data?.tempPassword) { toast({ title: err ?? "Could not get the password", variant: "destructive" }); return; }
    setTempTitle(action === "show" ? "Temporary password" : "New temporary password");
    setTemp(res.data.tempPassword);
  };
  const [role, setRole] = useState<string | null>(access?.role_key ?? null);
  const [all, setAll] = useState(access ? access.all_venues : true);
  const [ids, setIds] = useState<string[]>(access?.venue_ids ?? []);
  const [busy, setBusy] = useState(false);
  const picked = roles.find((r) => r.role_key === role);
  const lockedOwner = access?.role_key === "owner" && !canOwner;
  const ready = !!role && (all || ids.length > 0);
  const save = async () => { if (!role) return; setBusy(true); const ok = await assign(tenantId, userId, role, all, ids); setBusy(false); if (ok) { toast({ title: `${name} saved` }); onSaved(); } };
  return <>
    <button type="button" className="self-start px-[var(--settings-pad)] pt-2 text-[13px] text-[#1F6B5E]" onClick={onClose}>‹ People</button>
    <SettingsCard title={name} editing>
      {lockedOwner ? <Row label="Role" value="Owner · only Bani can change an owner" />
        : <><RoleCards roles={roles} value={role} onChange={setRole} canOwner={canOwner} />
          <div className="pt-4"><VenuePicks venues={venues} all={all} ids={ids} onChange={(a, v) => { setAll(a); setIds(v); }} /></div>
          <SaveBar dirty={ready} saving={busy} onSave={() => void save()} onCancel={onClose} /></>}
    </SettingsCard>
    {temp ? <TempPasswordCard title={tempTitle} name={name} email={email} password={temp} onDone={() => setTemp(null)} />
      : <SettingsCard title="Password">
        <Row label="Sign-in" value={pending ? <span className="text-[#B45309]">Has not set a password yet</span> : "Using their own password"} />
        <div className="flex gap-5 pt-1">
          {pending && <button type="button" disabled={resetting} className="text-[13px] font-medium text-[#1F6B5E]" onClick={() => void reset("show")}>Show temporary password</button>}
          <button type="button" disabled={resetting} className="text-[13px] font-medium text-[#1F6B5E]" onClick={() => void reset("reset")}>{resetting ? "Working…" : "Reset password"}</button>
        </div>
      </SettingsCard>}
    {picked && <SettingsCard title={`What a ${picked.name.toLowerCase()} can do`}>
      {ROLE_AREAS.map((a) => <Row key={a} label={AREA_LABEL[a]} value={LEVEL_SHORT[picked[a]]} />)}
      <Row label="Money" value={moneyLabel(picked.money)} />
      <p className="pt-1 text-[12.5px] text-muted-foreground">Set by Bani</p>
    </SettingsCard>}
  </>;
}

/** Add person: who, role, venues. Creates the account (they get an email to set a password), then gives the role. */
export function InviteCard({ tenantId, roles, venues, canOwner, onClose, onDone }: {
  tenantId: string; roles: TenantRole[]; venues: Venue[]; canOwner: boolean; onClose: () => void; onDone: () => void;
}) {
  const [email, setEmail] = useState(""), [first, setFirst] = useState(""), [last, setLast] = useState("");
  const name = `${first.trim()} ${last.trim()}`.trim();
  const [role, setRole] = useState<string | null>(null);
  const [all, setAll] = useState(false), [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const ready = /\S+@\S+\.\S+/.test(email) && !!first.trim() && !!role && (all || ids.length > 0);
  const send = async () => {
    if (!role) return;
    setBusy(true);
    const res = await invokeCreateUser({ email: email.trim(), displayName: name || undefined, firstName: first.trim() || undefined, lastName: last.trim() || undefined, position: legacyPosition(role), tenant_id: tenantId });
    const err = await fnError(res);
    if (err || !res.data?.userId) { setBusy(false); toast({ title: err ?? "Could not add this person", variant: "destructive" }); return; }
    const ok = await assign(tenantId, res.data.userId, role, all, ids);
    setBusy(false);
    if (res.data?.tempPassword) setDone(res.data.tempPassword);
    if (!ok) toast({ title: `${name || email.trim()} added; pick their role again from People` });
    if (!res.data?.tempPassword) onDone();
  };
  const roleName = roles.find((r) => r.role_key === role)?.name;
  const venueText = all ? "All venues" : venues.filter((v) => ids.includes(v.id)).map((v) => v.name).join(", ");
  if (done) return <><TempPasswordCard name={name} email={email.trim()} password={done} detail={[roleName, venueText].filter(Boolean).join(" · ")} onDone={onDone} /></>;
  return <>
    <button type="button" className="self-start px-[var(--settings-pad)] pt-2 text-[13px] text-[#1F6B5E]" onClick={onClose}>‹ People</button>
    <SettingsCard title="Who" editing>
      <Field label="Email" htmlFor="invite-email" missing={!email}><Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@business.com" /></Field>
      <Field label="First name" htmlFor="invite-first" missing={!first.trim()}><Input id="invite-first" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" /></Field>
      <Field label="Last name" htmlFor="invite-last"><Input id="invite-last" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" /></Field>
    </SettingsCard>
    <SettingsCard title="Role"><RoleCards roles={roles} value={role} onChange={setRole} canOwner={canOwner} /></SettingsCard>
    <SettingsCard title="Venues"><VenuePicks venues={venues} all={all} ids={ids} onChange={(a, v) => { setAll(a); setIds(v); }} />
      <SaveBar dirty={ready} saving={busy} label="Add person" onSave={() => void send()} onCancel={onClose} /></SettingsCard>
  </>;
}
