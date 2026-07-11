/**
 * All onboarding step subcomponents. Each accepts a common `StepProps` shape
 * so `ClientOnboarding.tsx` can render them uniformly inside the phase accordion.
 *
 * Kept in one file to reduce module fan-out; each Step* export is independent.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ExternalLink, CheckCircle2, FileDown } from "lucide-react";
import { EmptyState, fmtHKWhole } from "@/components/expenses/shared";
import { CreateUserDialog } from "@/components/access-control/CreateUserDialog";

export interface StepProps {
  tenantId: string;
  onComplete: () => void | Promise<void>;
  onProgress?: () => void | Promise<void>;
}

const TIMEZONES = ["Asia/Hong_Kong","Asia/Singapore","Asia/Macau","Europe/London","Europe/Paris","Asia/Kathmandu","Asia/Kolkata","Asia/Bangkok","Asia/Ho_Chi_Minh","UTC"];
const CURRENCIES = ["HKD","USD","EUR","GBP","SGD","MOP","INR","NPR","THB","VND"];
const COUNTRIES = ["HK","SG","MO","GB","FR","NP","IN","TH","VN","Other"];

// ---------- Phase 1: Organizations ----------
export function StepOrganizations({ tenantId, onComplete }: StepProps) {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<any>(null);

  const load = async () => {
    const { data } = await supabase.from("organizations").select("*").eq("tenant_id", tenantId).order("name");
    setOrgs(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [tenantId]);

  const save = async (o: any) => {
    if (!o.name?.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const { error } = await supabase.rpc("platform_upsert_organization", {
      _tenant_id: tenantId,
      _id: o.id ?? null,
      _name: o.name,
      _legal_name: o.legal_name ?? null,
      _registration_number: o.registration_number ?? null,
      _incorporation_date: o.incorporation_date || null,
      _registered_address: o.registered_address ?? null,
      _auditor: o.auditor ?? null,
      _industry: o.industry ?? null,
    });
    if (error) return toast({ title: o.id ? "Save failed" : "Create failed", description: error.message, variant: "destructive" });
    setDraft(null);
    await load();
    toast({ title: "Saved" });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this organization?")) return;
    const { error } = await supabase.rpc("platform_delete_organization", { _tenant_id: tenantId, _id: id });
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    await load();
  };


  return (
    <div className="space-y-3">
      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
      {!loading && orgs.length === 0 && !draft && (
        <EmptyState
          title="No organizations yet"
          description="Add at least one legal entity before creating venues and bank accounts."
          action={<Button size="sm" onClick={() => setDraft({})}><Plus className="h-4 w-4 mr-1"/>Add organization</Button>}
        />
      )}
      <div className="space-y-2">
        {orgs.map((o) => (
          <div key={o.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-medium">{o.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {o.legal_name ?? "—"} · BR {o.registration_number ?? "—"} · {o.industry ?? "no industry"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setDraft(o)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(o.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
            </div>
          </div>
        ))}
      </div>
      {orgs.length > 0 && !draft && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDraft({})}><Plus className="h-4 w-4 mr-1"/>Add another</Button>
          <Button size="sm" onClick={onComplete}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
        </div>
      )}
      {draft && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Trading name"><Input value={draft.name ?? ""} onChange={(e) => setDraft({...draft, name: e.target.value})}/></Field>
            <Field label="Legal name"><Input value={draft.legal_name ?? ""} onChange={(e) => setDraft({...draft, legal_name: e.target.value})}/></Field>
            <Field label="Registration # (BR)"><Input value={draft.registration_number ?? ""} onChange={(e) => setDraft({...draft, registration_number: e.target.value})}/></Field>
            <Field label="Incorporation date"><Input type="date" value={draft.incorporation_date ?? ""} onChange={(e) => setDraft({...draft, incorporation_date: e.target.value})}/></Field>
            <Field label="Industry"><Input placeholder="e.g. food_and_beverage" value={draft.industry ?? ""} onChange={(e) => setDraft({...draft, industry: e.target.value})}/></Field>
            <Field label="Auditor"><Input value={draft.auditor ?? ""} onChange={(e) => setDraft({...draft, auditor: e.target.value})}/></Field>
            <div className="md:col-span-2">
              <Field label="Registered address">
                <Textarea rows={2} value={draft.registered_address ?? ""} onChange={(e) => setDraft({...draft, registered_address: e.target.value})}/>
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="sm" onClick={() => save(draft)}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Phase 1: Venues ----------
export function StepVenues({ tenantId, onComplete }: StepProps) {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: os, error: oe }, { data: vs, error: ve }] = await Promise.all([
      supabase.from("organizations").select("id, name").eq("tenant_id", tenantId).order("name"),
      supabase.from("venues").select("id, name, organization_id, is_active").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
    ]);
    if (oe) toast({ title: "Could not load organizations", description: oe.message, variant: "destructive" });
    if (ve) toast({ title: "Could not load venues", description: ve.message, variant: "destructive" });
    setOrgs(os ?? []);
    setVenues(vs ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [tenantId]);

  const save = async (v: any) => {
    if (!v.name?.trim() || !v.organization_id) return toast({ title: "Name and organization required", variant: "destructive" });
    const { error } = await supabase.rpc("platform_upsert_venue", {
      _tenant_id: tenantId,
      _id: v.id ?? null,
      _name: v.name,
      _organization_id: v.organization_id,
    });
    if (error) return toast({ title: v.id ? "Save failed" : "Create failed", description: error.message, variant: "destructive" });
    setDraft(null);
    await load();
    toast({ title: "Venue saved" });
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (orgs.length === 0) return (
    <EmptyState
      title="Add organizations first"
      description="Every venue needs a parent organization. Create one in the Organizations step above, then refresh."
      action={<Button size="sm" variant="outline" onClick={load}>Refresh</Button>}
    />
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {venues.map((v) => (
          <div key={v.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{v.name}</div>
              <div className="text-xs text-muted-foreground">{orgs.find((o) => o.id === v.organization_id)?.name ?? <span className="text-destructive">No organization</span>}</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDraft(v)}>Edit</Button>
          </div>
        ))}
        {venues.length === 0 && !draft && (
          <EmptyState title="No venues yet" action={<Button size="sm" onClick={() => setDraft({ organization_id: orgs[0].id })}><Plus className="h-4 w-4 mr-1"/>Add venue</Button>} />
        )}
      </div>
      {!draft && venues.length > 0 && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDraft({ organization_id: orgs[0].id })}><Plus className="h-4 w-4 mr-1"/>Add another</Button>
          <Button size="sm" onClick={onComplete}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
        </div>
      )}
      {draft && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
          <Field label="Venue name"><Input value={draft.name ?? ""} onChange={(e) => setDraft({...draft, name: e.target.value})}/></Field>
          <Field label="Organization">
            <Select value={draft.organization_id ?? ""} onValueChange={(v) => setDraft({...draft, organization_id: v})}>
              <SelectTrigger><SelectValue placeholder="Choose…"/></SelectTrigger>
              <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="sm" onClick={() => save(draft)}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}


// ---------- Phase 1: Localisation ----------
const FY_PRESETS: { label: string; mm: number; dd: number }[] = [
  { label: "31 December", mm: 12, dd: 31 },
  { label: "31 March", mm: 3, dd: 31 },
  { label: "30 June", mm: 6, dd: 30 },
  { label: "30 September", mm: 9, dd: 30 },
];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_IN_MONTH = [31,29,31,30,31,30,31,31,30,31,30,31];

// FY end stored as anchor date "2000-MM-DD" (only month/day matter).
const toFyEndStr = (mm: number, dd: number) => `2000-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
const parseFyEnd = (s: string | null | undefined): { mm: number; dd: number } | null => {
  if (!s) return null;
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { mm: parseInt(m[1], 10), dd: parseInt(m[2], 10) };
};
const fmtDMY = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function StepLocalisation({ tenantId, onComplete }: StepProps) {
  const [tenant, setTenant] = useState<any>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("tenants").select("id, timezone, base_currency, country, financial_year_end, financial_year_start_year").eq("id", tenantId).single();
    setTenant(data);
    // Open custom editor if the saved value isn't a preset
    const parsed = parseFyEnd(data?.financial_year_end);
    if (parsed && !FY_PRESETS.some((p) => p.mm === parsed.mm && p.dd === parsed.dd)) {
      setCustomOpen(true);
    }
  };
  useEffect(() => { load(); }, [tenantId]);

  const fyEnd = parseFyEnd(tenant?.financial_year_end);
  const activePreset = fyEnd ? FY_PRESETS.find((p) => p.mm === fyEnd.mm && p.dd === fyEnd.dd) : undefined;

  const summary = useMemo(() => {
    if (!fyEnd || !tenant?.financial_year_start_year) return null;
    const startYear = Number(tenant.financial_year_start_year);
    if (!Number.isFinite(startYear)) return null;
    // First FY ends on (startYear, fyEnd.mm, fyEnd.dd); starts one year earlier + 1 day.
    const fyEndDate = new Date(startYear, fyEnd.mm - 1, fyEnd.dd);
    const fyStartDate = new Date(startYear - 1, fyEnd.mm - 1, fyEnd.dd);
    fyStartDate.setDate(fyStartDate.getDate() + 1);
    const closingDate = new Date(fyStartDate);
    closingDate.setDate(closingDate.getDate() - 1);
    return {
      first: `${fmtDMY(fyStartDate)} → ${fmtDMY(fyEndDate)}`,
      closing: fmtDMY(closingDate),
    };
  }, [fyEnd?.mm, fyEnd?.dd, tenant?.financial_year_start_year]);

  const pickPreset = (mm: number, dd: number) => {
    setTenant({ ...tenant, financial_year_end: toFyEndStr(mm, dd) });
    setCustomOpen(false);
  };

  const save = async () => {
    const { error } = await supabase.rpc("platform_update_tenant_localisation", {
      _tenant_id: tenantId,
      _timezone: tenant.timezone ?? null,
      _base_currency: tenant.base_currency ?? null,
      _country: tenant.country ?? null,
      _financial_year_end: tenant.financial_year_end || null,
      _financial_year_start_year: tenant.financial_year_start_year || null,
    });
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved" });
    onComplete();
  };

  if (!tenant) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const customMm = customOpen && fyEnd ? fyEnd.mm : 12;
  const customDd = customOpen && fyEnd ? fyEnd.dd : 31;
  const maxDay = DAYS_IN_MONTH[customMm - 1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Timezone">
          <Select value={tenant.timezone ?? "Asia/Hong_Kong"} onValueChange={(v) => setTenant({...tenant, timezone: v})}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Base currency">
          <Select value={tenant.base_currency ?? "HKD"} onValueChange={(v) => setTenant({...tenant, base_currency: v})}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Country">
          <Select value={tenant.country ?? "HK"} onValueChange={(v) => setTenant({...tenant, country: v})}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="First FY end year">
          <Input type="number" placeholder="e.g. 2026" value={tenant.financial_year_start_year ?? ""} onChange={(e) => setTenant({...tenant, financial_year_start_year: Number(e.target.value) || null})}/>
        </Field>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Financial year end</div>
        <div className="flex flex-wrap gap-2">
          {FY_PRESETS.map((p) => {
            const isActive = !customOpen && activePreset?.label === p.label;
            return (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant={isActive ? "default" : "outline"}
                onClick={() => pickPreset(p.mm, p.dd)}
              >
                {p.label}
              </Button>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant={customOpen ? "default" : "outline"}
            onClick={() => {
              const next = !customOpen;
              setCustomOpen(next);
              if (next && !fyEnd) setTenant({ ...tenant, financial_year_end: toFyEndStr(12, 31) });
            }}
          >
            Custom
          </Button>
        </div>
        {customOpen && (
          <div className="flex items-center gap-2 pt-1">
            <Select value={String(customMm)} onValueChange={(v) => {
              const mm = Number(v);
              const dd = Math.min(customDd, DAYS_IN_MONTH[mm - 1]);
              setTenant({ ...tenant, financial_year_end: toFyEndStr(mm, dd) });
            }}>
              <SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
              <SelectContent>{MONTH_NAMES.map((n, i) => <SelectItem key={n} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              max={maxDay}
              value={customDd}
              onChange={(e) => {
                const dd = Math.min(Math.max(1, Number(e.target.value) || 1), maxDay);
                setTenant({ ...tenant, financial_year_end: toFyEndStr(customMm, dd) });
              }}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">Month &amp; day only — no year.</span>
          </div>
        )}
      </div>

      {summary ? (
        <div className="rounded-lg border border-success/40 bg-success/5 p-4 space-y-1.5 text-sm">
          <div>
            <span className="text-muted-foreground">Closing balance date:</span>{" "}
            <span className="font-semibold text-foreground">{summary.closing}</span>
          </div>
          <div>
            <span className="text-muted-foreground">First financial year:</span>{" "}
            <span className="font-semibold text-foreground">{summary.first}</span>
          </div>
          <div className="text-xs text-muted-foreground pt-1">
            Opening balances are entered as at the closing balance date; the first financial year begins the day after.
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Pick a financial year end and enter the first FY end year to preview the closing balance date and first financial year.
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={save}><CheckCircle2 className="h-4 w-4 mr-1"/>Save &amp; mark complete</Button>
      </div>
    </div>
  );
}

// ---------- Phase 2: Chart of accounts ----------
//
// Safety: the platform_load_coa_template RPC uses ON CONFLICT (tenant_id, code)
// DO NOTHING, so it never overwrites existing accounts and cannot create
// duplicate codes (unique constraint on (tenant_id, code)). Still, when the
// chart is already populated we hide the bulk "Load template" buttons and
// gate template use behind an explicit "preview missing accounts" flow, so
// nothing can be inserted against live financial data without the user
// seeing exactly which codes would be added.
export function StepCoA({ tenantId, onComplete }: StepProps) {
  const [count, setCount] = useState<number | null>(null);
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<any[]>([]);
  const [previewFor, setPreviewFor] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAugment, setShowAugment] = useState(false);

  const load = async () => {
    const [codesRes, { data: t }] = await Promise.all([
      supabase.from("chart_of_accounts").select("code").eq("tenant_id", tenantId),
      supabase.from("coa_templates").select("*").eq("is_active", true).order("name"),
    ]);
    const codes = new Set((codesRes.data ?? []).map((r: any) => String(r.code)));
    setExistingCodes(codes);
    setCount(codes.size);
    setTemplates(t ?? []);
  };
  useEffect(() => { load(); }, [tenantId]);

  const missingFor = (tpl: any): { code: string; name: string }[] => {
    const rows: any[] = Array.isArray(tpl.template) ? tpl.template : [];
    return rows
      .filter((r) => !existingCodes.has(String(r.code)))
      .map((r) => ({ code: String(r.code), name: String(r.name) }));
  };

  const loadTemplateBlind = async (tpl: any) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("platform_load_coa_template", { _tenant_id: tenantId, _template_id: tpl.id });
    setBusy(false);
    if (error) return toast({ title: "Load failed", description: error.message, variant: "destructive" });
    toast({ title: `Loaded ${data ?? 0} accounts from ${tpl.name}` });
    await load();
  };

  const confirmAddMissing = async () => {
    if (!previewFor) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("platform_load_coa_template", { _tenant_id: tenantId, _template_id: previewFor.id });
    setBusy(false);
    if (error) return toast({ title: "Add failed", description: error.message, variant: "destructive" });
    toast({ title: `Added ${data ?? 0} missing accounts from ${previewFor.name}` });
    setPreviewFor(null);
    setShowAugment(false);
    await load();
  };

  if (count === null) return <div className="text-sm text-muted-foreground">Loading…</div>;

  // ------- Non-empty chart: safe, read-first UI -------
  if (count > 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-success/40 bg-success/5 p-3 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5"/>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Chart of accounts already configured — {count} accounts</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Live chart is managed on the Chart of Accounts page. Templates are hidden here to avoid accidental bulk changes to live data.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/finance/chart-of-accounts"><ExternalLink className="h-4 w-4 mr-1"/>View / edit chart</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAugment((s) => !s)}>
            {showAugment ? "Hide template augment" : "Add missing template accounts…"}
          </Button>
          <Button size="sm" className="ml-auto" onClick={onComplete}>
            <CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete
          </Button>
        </div>

        {showAugment && (
          <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
            <div className="text-xs text-muted-foreground">
              Additive only. Any template account whose code already exists in the chart is skipped — no overwrite, no duplicate. Review the preview before committing.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {templates.map((t) => {
                const missing = missingFor(t);
                return (
                  <div key={t.id} className="border border-border rounded-lg p-3">
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                    <div className="text-xs mt-1">
                      <span className="text-muted-foreground">Template: </span>
                      <span className="tabular-nums">{(t.template as any[]).length}</span>
                      <span className="text-muted-foreground"> · Missing here: </span>
                      <span className="tabular-nums font-medium">{missing.length}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={busy || missing.length === 0}
                      onClick={() => setPreviewFor(t)}
                    >
                      {missing.length === 0 ? "Nothing to add" : `Preview ${missing.length} to add`}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {previewFor && (
          <div className="border border-warning/40 rounded-lg p-3 space-y-3 bg-warning/5">
            <div className="text-sm font-medium">
              Add {missingFor(previewFor).length} accounts from “{previewFor.name}” to the existing chart
            </div>
            <div className="max-h-56 overflow-auto border border-border rounded-md bg-background/60">
              <table className="text-xs w-full">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-2 py-1 font-medium">Code</th>
                    <th className="text-left px-2 py-1 font-medium">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {missingFor(previewFor).map((r) => (
                    <tr key={r.code} className="border-t border-border/60">
                      <td className="px-2 py-1 tabular-nums">{r.code}</td>
                      <td className="px-2 py-1">{r.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPreviewFor(null)} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={confirmAddMissing} disabled={busy}>
                <FileDown className="h-4 w-4 mr-1"/>Confirm add {missingFor(previewFor).length}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ------- Empty chart: original three-option layout -------
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">Chart is empty — pick a starting point.</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {templates.map((t) => (
          <div key={t.id} className="border border-border rounded-lg p-3">
            <div className="font-medium text-sm">{t.name}</div>
            <div className="text-xs text-muted-foreground">{t.description}</div>
            <div className="text-xs text-muted-foreground mt-1">{(t.template as any[]).length} accounts</div>
            <Button size="sm" className="mt-2" disabled={busy} onClick={() => loadTemplateBlind(t)}>
              <FileDown className="h-4 w-4 mr-1"/>Load template
            </Button>
          </div>
        ))}
        <div className="border border-dashed border-border rounded-lg p-3">
          <div className="font-medium text-sm">Import CSV</div>
          <div className="text-xs text-muted-foreground">Column mapping + validation preview. Available on /finance/chart-of-accounts.</div>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link to="/finance/chart-of-accounts"><ExternalLink className="h-4 w-4 mr-1"/>Open CoA</Link>
          </Button>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={onComplete} disabled={!count}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
      </div>
    </div>
  );
}

// ---------- Phase 2: Suppliers ----------
export function StepSuppliers({ tenantId, onComplete }: StepProps) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).then(({ count }) => setCount(count ?? 0));
  }, [tenantId]);
  return (
    <div className="space-y-3">
      <div className="text-sm">Current suppliers: <span className="font-medium">{count ?? "…"}</span></div>
      <div className="text-sm text-muted-foreground">Manage suppliers and bulk-import from the Procurement module.</div>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline"><Link to="/procurement/suppliers"><ExternalLink className="h-4 w-4 mr-1"/>Open Suppliers</Link></Button>
        <Button size="sm" onClick={onComplete} disabled={!count}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
      </div>
    </div>
  );
}

// ---------- Phase 2: Revenue sources & service periods ----------
export function StepRevenue({ tenantId, onComplete }: StepProps) {
  const [rs, setRs] = useState<number | null>(null);
  const [sp, setSp] = useState<number | null>(null);
  useEffect(() => {
    Promise.all([
      supabase.from("revenue_sources").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase.from("venue_service_periods").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]).then(([a, b]) => { setRs(a.count ?? 0); setSp(b.count ?? 0); });
  }, [tenantId]);
  return (
    <div className="space-y-3">
      <div className="text-sm">Revenue sources: <span className="font-medium">{rs ?? "…"}</span> · Service periods: <span className="font-medium">{sp ?? "…"}</span></div>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline"><Link to="/admin/master-data"><ExternalLink className="h-4 w-4 mr-1"/>Configure</Link></Button>
        <Button size="sm" onClick={onComplete} disabled={!rs}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
      </div>
    </div>
  );
}

// ---------- Phase 3: First sale / first invoice ----------
export function StepFirstSale({ tenantId, onComplete }: StepProps) {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.from("sales_records").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).then(({ count }) => setHas((count ?? 0) > 0));
  }, [tenantId]);
  return (
    <div className="space-y-2">
      <div className="text-sm">{has === null ? "Checking…" : has ? "✅ Sales records detected" : "No sales records yet"}</div>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline"><Link to="/sales-data"><ExternalLink className="h-4 w-4 mr-1"/>Daily Sales</Link></Button>
        <Button size="sm" onClick={onComplete} disabled={!has}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
      </div>
    </div>
  );
}
export function StepFirstInvoice({ tenantId, onComplete }: StepProps) {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).then(({ count }) => setHas((count ?? 0) > 0));
  }, [tenantId]);
  return (
    <div className="space-y-2">
      <div className="text-sm">{has === null ? "Checking…" : has ? "✅ Invoices detected" : "No invoices yet"}</div>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline"><Link to="/procurement/invoices"><ExternalLink className="h-4 w-4 mr-1"/>Procurement</Link></Button>
        <Button size="sm" onClick={onComplete} disabled={!has}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
      </div>
    </div>
  );
}

// ---------- Phase 4: GL opening balances ----------
export function StepGLOpening({ tenantId, onComplete }: StepProps) {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [rows, setRows] = useState<Record<string, { debit: number; credit: number; id?: string }>>({});
  const [asAt, setAsAt] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("organizations").select("id, name").eq("tenant_id", tenantId).order("name").then(({ data }) => {
      setOrgs(data ?? []); if (data?.[0]) setOrgId(data[0].id);
    });
  }, [tenantId]);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      supabase.from("chart_of_accounts").select("id, code, name, account_type, normal_side").eq("tenant_id", tenantId).eq("is_active", true).order("sort_order"),
      supabase.from("account_opening_balances").select("*").eq("tenant_id", tenantId).eq("organization_id", orgId),
    ]).then(([a, b]) => {
      setAccounts(a.data ?? []);
      const map: Record<string, any> = {};
      (b.data ?? []).forEach((r: any) => { map[r.coa_account_id] = { debit: Number(r.debit), credit: Number(r.credit), id: r.id }; if (r.as_at_date && !asAt) setAsAt(r.as_at_date); });
      setRows(map);
    });
  }, [orgId, tenantId]); // eslint-disable-line

  const totalDr = Object.values(rows).reduce((s, r) => s + (r.debit || 0), 0);
  const totalCr = Object.values(rows).reduce((s, r) => s + (r.credit || 0), 0);
  const diff = totalDr - totalCr;
  const balanced = Math.abs(diff) < 0.01;

  const setCell = (accId: string, side: "debit" | "credit", val: number) => {
    setRows((r) => ({ ...r, [accId]: { ...(r[accId] ?? { debit: 0, credit: 0 }), [side]: val } }));
  };

  const save = async () => {
    if (!asAt) return toast({ title: "As-at date required", variant: "destructive" });
    setSaving(true);
    const upserts = Object.entries(rows).filter(([, v]) => (v.debit || 0) !== 0 || (v.credit || 0) !== 0)
      .map(([accId, v]) => ({
        organization_id: orgId, coa_account_id: accId, as_at_date: asAt,
        debit: v.debit || 0, credit: v.credit || 0, status: "draft",
      }));
    const { error } = await supabase.rpc("platform_upsert_account_opening_balances", { _tenant_id: tenantId, _rows: upserts as any });
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved as draft" });
  };


  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    accounts.forEach((a) => { (g[a.account_type] ||= []).push(a); });
    return g;
  }, [accounts]);

  if (orgs.length === 0) return <EmptyState title="Add an organization first" />;
  if (accounts.length === 0) return <EmptyState title="Load the chart of accounts first" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Organization">
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="As-at date"><Input type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)}/></Field>
        <div className="flex items-end">
          <Badge variant={balanced ? "default" : "destructive"} className="text-xs">
            {balanced ? "Balanced" : `Out of balance ${fmtHKWhole(diff)}`}
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-3 text-xs uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
        <div>Account</div><div className="text-right">Debit</div><div className="text-right">Credit</div>
      </div>
      <div className="max-h-[400px] overflow-auto space-y-3">
        {Object.entries(grouped).map(([type, arr]) => (
          <div key={type}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-2 mb-1">{type}</div>
            {arr.map((a) => (
              <div key={a.id} className="grid grid-cols-3 gap-2 items-center py-1">
                <div className="text-sm truncate">{a.code} · {a.name}</div>
                <Input type="number" className="text-right tabular-nums" value={rows[a.id]?.debit ?? ""} onChange={(e) => setCell(a.id, "debit", Number(e.target.value) || 0)}/>
                <Input type="number" className="text-right tabular-nums" value={rows[a.id]?.credit ?? ""} onChange={(e) => setCell(a.id, "credit", Number(e.target.value) || 0)}/>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 text-sm font-medium border-t border-border pt-2">
        <div>Totals</div>
        <div className="text-right tabular-nums">{fmtHKWhole(totalDr)}</div>
        <div className="text-right tabular-nums">{fmtHKWhole(totalCr)}</div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={save} disabled={saving}>Save draft</Button>
        <Button size="sm" onClick={onComplete} disabled={!balanced}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
      </div>
    </div>
  );
}

// ---------- Phase 4: AR / AP opening (link out) ----------
export function StepAROpening({ tenantId, onComplete }: StepProps) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    supabase.from("customer_opening_balances").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).then(({ count }) => setCount(count ?? 0));
  }, [tenantId]);
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">Enter open customer invoices at conversion date. Currently: {count ?? "…"} entries.</div>
      <div className="text-xs text-muted-foreground">Full AR editor with allocation tie-out to the AR control account ships in the next iteration. Mark skipped if not applicable.</div>
      <div className="flex justify-end"><Button size="sm" onClick={onComplete}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button></div>
    </div>
  );
}
export function StepAPOpening({ tenantId, onComplete }: StepProps) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">Open supplier bills and credit notes at conversion date. Use the existing Procurement opening-balances editor.</div>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline"><Link to="/procurement/opening-balances"><ExternalLink className="h-4 w-4 mr-1"/>Open editor</Link></Button>
        <Button size="sm" onClick={onComplete}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
      </div>
    </div>
  );
}

// ---------- Phase 5: Team ----------
export function StepTeam({ tenantId, onComplete }: StepProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const load = async () => {
    const { data } = await supabase.from("tenant_members").select("user_id, role").eq("tenant_id", tenantId);
    setUsers(data ?? []);
  };
  useEffect(() => { load(); }, [tenantId]);
  return (
    <div className="space-y-2">
      <div className="text-sm">{users.length} member{users.length === 1 ? "" : "s"} added</div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1"/>Invite user</Button>
        <Button asChild size="sm" variant="outline"><Link to="/user-access"><ExternalLink className="h-4 w-4 mr-1"/>Manage in User Access</Link></Button>
        <Button size="sm" onClick={onComplete} disabled={users.length === 0}><CheckCircle2 className="h-4 w-4 mr-1"/>Mark complete</Button>
      </div>
      <CreateUserDialog open={showAdd} onOpenChange={setShowAdd} tenantId={tenantId} onCreated={load}/>
    </div>
  );
}

// ---------- Small helpers ----------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
