// Settings › Accounting › Assets: when a purchase is an asset, each class's account and years, and where
// depreciation posts. Bani follows this when an equipment bill is booked. Owners and admins edit it.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAssetPolicy, type AssetClass } from "@/hooks/useAssetPolicy";
import { SettingsCard, SaveBar } from "@/components/settings/SettingsForm";
import { Input } from "@/components/ui/input";

type Acct = { id: string; code: string; name: string; account_type: string };
const th = "h-9 px-3 text-left text-[11px] font-medium uppercase tracking-[.04em] text-muted-foreground first:pl-0";
const td = "h-12 px-3 align-middle text-[13px] first:pl-0";
const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]";
const label = (a?: Acct) => a ? `${a.code} ${a.name}` : "Not set";

export function AssetsPage() {
  const { tenantId } = useActiveTenant();
  const p = useAssetPolicy(tenantId);
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [rules, setRules] = useState<{ threshold: string; accum: string; expense: string } | null>(null);
  const [classes, setClasses] = useState<Record<string, { acct: string; years: string }> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!tenantId) return;
    void (supabase as any).from("chart_of_accounts").select("id,code,name,account_type").eq("tenant_id", tenantId).eq("is_active", true).order("code")
      .then(({ data }: { data: Acct[] | null }) => setAccounts(data ?? []));
  }, [tenantId]);
  const byId = (id: string | null) => accounts.find(a => a.id === id);
  const assetAccts = accounts.filter(a => a.account_type === "asset");
  const expenseAccts = accounts.filter(a => ["opex", "other_expense"].includes(a.account_type));
  const s = p.settings;
  const done = (e: string | null) => { setSaving(false); if (e) setError(/row-level|permission|policy/i.test(e) ? "Only owners and admins can change this." : e); else { setError(""); setRules(null); setClasses(null); } };

  const saveRules = async () => {
    const t = Number(rules!.threshold);
    if (!(t >= 0)) { setError("Enter an amount"); return; }
    setSaving(true);
    done(await p.saveSettings({ threshold: t, accum_account_id: rules!.accum || null, expense_account_id: rules!.expense || null }));
  };
  const saveClasses = async () => {
    const rows = p.classes.map(c => ({ id: c.id, asset_account_id: classes![c.id].acct || null, useful_years: Number(classes![c.id].years) }));
    if (rows.some(r => !(r.useful_years >= 1 && r.useful_years <= 50))) { setError("Years must be 1 to 50"); return; }
    setSaving(true);
    done(await p.saveClasses(rows));
  };
  const startClasses = () => setClasses(Object.fromEntries(p.classes.map((c: AssetClass) => [c.id, { acct: c.asset_account_id ?? "", years: String(c.useful_years) }])));

  if (p.loading && !s) return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  return <div className="space-y-4">
    <SettingsCard title="Rules" editing={!!rules} onEdit={() => s && setRules({ threshold: String(s.threshold), accum: s.accum_account_id ?? "", expense: s.expense_account_id ?? "" })}>
      {!rules ? <div className="grid gap-6 text-[13px] sm:grid-cols-3">
        <div><p className="text-[11px] text-muted-foreground">Asset from</p><p className="mt-1 font-medium">HK${(s?.threshold ?? 5000).toLocaleString("en-HK")} per item</p></div>
        <div><p className="text-[11px] text-muted-foreground">Method</p><p className="mt-1 font-medium">Monthly, straight line</p></div>
        <div><p className="text-[11px] text-muted-foreground">Posts to</p><p className="mt-1 font-medium">{label(byId(s?.expense_account_id ?? null))}</p></div>
      </div> : <div className="grid gap-4 text-[13px] sm:grid-cols-3">
        <label className="space-y-1"><span className="text-[11px] text-muted-foreground">Asset from (HK$)</span><Input inputMode="decimal" value={rules.threshold} onChange={e => setRules({ ...rules, threshold: e.target.value })} /></label>
        <label className="space-y-1"><span className="text-[11px] text-muted-foreground">Posts to</span><select className={sel} value={rules.expense} onChange={e => setRules({ ...rules, expense: e.target.value })}><option value="">Not set</option>{expenseAccts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></label>
        <label className="space-y-1"><span className="text-[11px] text-muted-foreground">Built up in</span><select className={sel} value={rules.accum} onChange={e => setRules({ ...rules, accum: e.target.value })}><option value="">Not set</option>{assetAccts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></label>
        <div className="sm:col-span-3"><SaveBar dirty saving={saving} onSave={() => void saveRules()} onCancel={() => { setRules(null); setError(""); }} /></div>
      </div>}
    </SettingsCard>
    <SettingsCard title="Asset classes" editing={!!classes} onEdit={startClasses}>
      <table className="w-full"><thead><tr className="border-b"><th className={th}>Class</th><th className={th}>Account</th><th className={`${th} w-24`}>Years</th></tr></thead>
        <tbody>{p.classes.map(c => <tr key={c.id} className="border-b last:border-b-0">
          <td className={`${td} font-medium`}>{c.name}</td>
          <td className={td}>{classes ? <select className={sel} value={classes[c.id].acct} onChange={e => setClasses({ ...classes, [c.id]: { ...classes[c.id], acct: e.target.value } })}><option value="">Not set</option>{assetAccts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select> : label(byId(c.asset_account_id))}</td>
          <td className={`${td} tabular-nums`}>{classes ? <Input className="h-9 w-20" inputMode="numeric" value={classes[c.id].years} onChange={e => setClasses({ ...classes, [c.id]: { ...classes[c.id], years: e.target.value } })} /> : c.useful_years}</td>
        </tr>)}</tbody></table>
      {classes && <SaveBar dirty saving={saving} onSave={() => void saveClasses()} onCancel={() => { setClasses(null); setError(""); }} />}
    </SettingsCard>
    {error && <p className="text-[13px] text-destructive">{error}</p>}
  </div>;
}
