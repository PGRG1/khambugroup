import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

async function assign(tenantId: string, userId: string, role: string, all: boolean, ids: string[]) {
  const { error } = await (supabase.rpc as any)("assign_user_role", { t: tenantId, u: userId, k: role, all_v: all, v: all ? [] : ids });
  if (error) { toast({ title: error.message, variant: "destructive" }); return false; }
  return true;
}

/** One person's access: role and venues to pick, what that role can do read-only. */
export function PersonAccessCard({ tenantId, userId, name, access, roles, venues, canOwner, onClose, onSaved }: {
  tenantId: string; userId: string; name: string; access?: PersonAccess; roles: TenantRole[]; venues: Venue[]; canOwner: boolean; onClose: () => void; onSaved: () => void;
}) {
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
    {picked && <SettingsCard title={`What a ${picked.name.toLowerCase()} can do`}>
      {ROLE_AREAS.map((a) => <Row key={a} label={AREA_LABEL[a]} value={LEVEL_SHORT[picked[a]]} />)}
      <Row label="Money" value={moneyLabel(picked.money)} />
      <p className="pt-1 text-[12.5px] text-muted-foreground">Set by Bani</p>
    </SettingsCard>}
  </>;
}

/** Invite: who, role, venues. Creates the account, then gives the role. */
export function InviteCard({ tenantId, roles, venues, canOwner, onClose, onDone }: {
  tenantId: string; roles: TenantRole[]; venues: Venue[]; canOwner: boolean; onClose: () => void; onDone: () => void;
}) {
  const [email, setEmail] = useState(""), [name, setName] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [all, setAll] = useState(false), [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ready = /\S+@\S+\.\S+/.test(email) && !!role && (all || ids.length > 0);
  const send = async () => {
    if (!role) return;
    setBusy(true);
    const res = await supabase.functions.invoke("create-user", { body: { email: email.trim(), displayName: name.trim() || undefined, position: legacyPosition(role), tenant_id: tenantId } });
    const err = res.error?.message ?? res.data?.error;
    if (err || !res.data?.userId) { setBusy(false); toast({ title: err ?? "Invite failed", variant: "destructive" }); return; }
    const ok = await assign(tenantId, res.data.userId, role, all, ids);
    setBusy(false);
    toast({ title: ok ? `Invite sent to ${email.trim()}` : `Invite sent; pick ${name || "their"} role again from People` });
    onDone();
  };
  return <>
    <button type="button" className="self-start px-[var(--settings-pad)] pt-2 text-[13px] text-[#1F6B5E]" onClick={onClose}>‹ People</button>
    <SettingsCard title="Who" editing>
      <Field label="Email" htmlFor="invite-email" missing={!email}><Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@business.com" /></Field>
      <Field label="Name" htmlFor="invite-name"><Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></Field>
    </SettingsCard>
    <SettingsCard title="Role"><RoleCards roles={roles} value={role} onChange={setRole} canOwner={canOwner} /></SettingsCard>
    <SettingsCard title="Venues"><VenuePicks venues={venues} all={all} ids={ids} onChange={(a, v) => { setAll(a); setIds(v); }} />
      <SaveBar dirty={ready} saving={busy} label="Send invite" onSave={() => void send()} onCancel={onClose} /></SettingsCard>
  </>;
}
