import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Plus, Receipt } from "lucide-react";
import {
  addSample, applyValue, checkSample, groupOf, GROUPS, lineOptions, missingBasics, valueOf,
  type Group, type SetupLine,
} from "@/utils/salesReportSetup";
import type { StepProps } from "./OnboardingSteps";

/**
 * Onboarding: set up how a client's sales report reads. The Bani team adds two or three sample
 * reports, Bani lists every printed line with a suggested meaning, the team confirms. Saved per
 * venue (or for all venues on the same POS). Clients can view the result; only the team edits it.
 */
type Line = SetupLine & { legacyField?: string | null; glAccountId?: string | null };
type Sample = { id: string; name: string; date: string | null; status: "reading" | "done" | "error"; error?: string };

const ALL = "";
const MISSING_LABEL = { total: "Total sales", guests: "Guests", orders: "Orders" } as const;

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});
const shortDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Sample");

export function StepSalesReport({ tenantId, onComplete, onProgress }: StepProps) {
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);
  const [scope, setScope] = useState(ALL);
  const [lines, setLines] = useState<Line[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [v, b] = await Promise.all([
        supabase.from("venues").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
        supabase.from("bank_accounts").select("id, bank_name, account_name, account_number_last4").eq("tenant_id", tenantId).eq("is_active", true).order("sort_order"),
      ]);
      setVenues((v.data ?? []).map((x) => ({ id: x.id, name: x.name })));
      setBanks((b.data ?? []).map((x) => ({ id: x.id, name: [x.bank_name || x.account_name, x.account_number_last4].filter(Boolean).join(" ") })));
    })();
  }, [tenantId]);

  // The saved setup for the venue (or all venues) in view.
  useEffect(() => {
    let live = true;
    setLoading(true); setSamples([]);
    (async () => {
      const lq = supabase.from("sales_report_lines").select("printed_name, kind, category, settles_to, bank_account_id, gl_account_id, legacy_field, sort_order").eq("tenant_id", tenantId).eq("is_active", true);
      const sq = supabase.from("sales_report_setups").select("confirmed_at").eq("tenant_id", tenantId);
      const [l, s] = await Promise.all([
        (scope ? lq.eq("venue_id", scope) : lq.is("venue_id", null)).order("sort_order"),
        (scope ? sq.eq("venue_id", scope) : sq.is("venue_id", null)).maybeSingle(),
      ]);
      if (!live) return;
      setLines((l.data ?? []).map((r) => ({
        printed: r.printed_name, kind: r.kind as Line["kind"], category: (r.category as Line["category"]) ?? null,
        settlesTo: (r.settles_to as Line["settlesTo"]) ?? null, bankAccountId: r.bank_account_id, glAccountId: r.gl_account_id,
        legacyField: r.legacy_field, amounts: {},
      })));
      setConfirmedAt(s.data?.confirmed_at ?? null);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [tenantId, scope]);

  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    onProgress?.();
    await Promise.all([...files].slice(0, 6).map(async (f) => {
      const id = crypto.randomUUID();
      setSamples((s) => [...s, { id, name: f.name, date: null, status: "reading" }]);
      try {
        const { data, error } = await supabase.functions.invoke("parse-receipt", {
          body: { op: "discover_lines", tenantId, imageBase64: await toBase64(f), mimeType: f.type || "image/jpeg", fileName: f.name },
        });
        if (error || !data?.success) throw new Error(data?.error || "Could not read this report");
        setLines((ls) => addSample(ls, id, data.data) as Line[]);
        setSamples((s) => s.map((x) => (x.id === id ? { ...x, status: "done", date: data.data.date } : x)));
      } catch (e) {
        setSamples((s) => s.map((x) => (x.id === id ? { ...x, status: "error", error: e instanceof Error ? e.message : "Could not read" } : x)));
      }
    }));
  };

  const options = useMemo(() => lineOptions(banks), [banks]);
  const read = samples.filter((s) => s.status === "done");
  const checks = read.map((s) => ({ s, c: checkSample(lines, s.id) }));
  const missing = lines.length ? missingBasics(lines) : [];
  const scopeName = scope ? venues.find((v) => v.id === scope)?.name ?? "venue" : "all venues";

  const save = async () => {
    if (!lines.length) { toast({ title: "Add a sample report first" }); return; }
    setSaving(true);
    const venueId = scope || null;
    const { data: me } = await supabase.auth.getUser();
    const del = supabase.from("sales_report_lines").delete().eq("tenant_id", tenantId);
    const delRes = await (venueId ? del.eq("venue_id", venueId) : del.is("venue_id", null));
    const insRes = delRes.error ? delRes : await supabase.from("sales_report_lines").insert(lines.map((l, i) => ({
      tenant_id: tenantId, venue_id: venueId, printed_name: l.printed, kind: l.kind, category: l.kind === "sales" ? l.category ?? "other" : null,
      settles_to: l.kind === "payment" ? l.settlesTo ?? "bank" : null, bank_account_id: l.kind === "payment" ? l.bankAccountId : null,
      gl_account_id: l.glAccountId ?? null, legacy_field: l.legacyField ?? null, sort_order: i, created_by: me.user?.id ?? null,
    })));
    let setupErr = insRes.error;
    if (!setupErr) {
      const sdel = supabase.from("sales_report_setups").delete().eq("tenant_id", tenantId);
      await (venueId ? sdel.eq("venue_id", venueId) : sdel.is("venue_id", null));
      const ins = await supabase.from("sales_report_setups").insert({ tenant_id: tenantId, venue_id: venueId, sample_count: read.length, confirmed_by: me.user?.id ?? null });
      setupErr = ins.error;
      if (!ins.error) setConfirmedAt(new Date().toISOString());
    }
    setSaving(false);
    if (setupErr) { toast({ title: "Setup not saved", description: "Only the Bani team can change a sales report setup.", variant: "destructive" }); return; }
    toast({ title: `Sales report set up for ${scopeName}` });
    await onComplete();
  };

  const row = (l: Line) => (
    <div key={l.printed} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <span className="min-w-[5.5rem] flex-1 text-[14px] leading-snug [overflow-wrap:anywhere]">{l.printed}</span>
      <select aria-label={`${l.printed} counts as`} value={valueOf(l)}
        onChange={(e) => setLines((ls) => ls.map((x) => (x === l ? (applyValue(x, e.target.value) as Line) : x)))}
        className="h-8 min-w-0 max-w-[11rem] flex-1 rounded-md border-0 px-2 text-[13px] outline-none" style={{ background: "#EEF0EE" }}>
        {GROUPS.map((g) => (
          <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select aria-label="Venue" value={scope} onChange={(e) => setScope(e.target.value)}
          className="h-9 rounded-md border-0 px-2 text-[13px] outline-none" style={{ background: "#EEF0EE" }}>
          <option value={ALL}>All venues (same POS)</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        {confirmedAt && <span className="text-[12px] text-muted-foreground">Set up {new Date(confirmedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {samples.map((s) => (
          <div key={s.id} title={s.error ?? s.name}
            className={`flex h-14 w-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px] ${s.status === "error" ? "border-[#B45309]/40 text-[#B45309]" : "border-border text-muted-foreground"}`}>
            {s.status === "reading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            <span>{s.status === "reading" ? "Reading" : s.status === "error" ? "Not read" : shortDate(s.date)}</span>
          </div>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add sample reports"
          className="flex h-14 w-[4.5rem] items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted/40">
          <Plus className="h-4 w-4" />
        </button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { readFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {!samples.length && !lines.length && !loading && <p className="text-[12px] text-muted-foreground">Add 2 or 3 sales reports from this venue's POS.</p>}
      {read.length > 0 && <p className="text-[12px] text-muted-foreground">{lines.length} lines on {read.length} report{read.length === 1 ? "" : "s"}</p>}

      {GROUPS.map((g: Group) => {
        const ls = lines.filter((l) => groupOf(l.kind) === g);
        const miss = g === "Basics" ? missing : [];
        if (!ls.length && !miss.length) return null;
        return (
          <div key={g}>
            <p className="mb-0.5 mt-2 text-[12px] text-muted-foreground">{g}</p>
            {ls.map(row)}
            {miss.map((k) => (
              <div key={k} className="flex items-center justify-between border-b border-border/60 py-2 text-[14px] text-muted-foreground last:border-b-0">
                <span>{MISSING_LABEL[k]}</span><span className="text-[12px]">Not on report</span>
              </div>
            ))}
          </div>
        );
      })}

      {lines.length > 0 && (adding === null
        ? <button type="button" onClick={() => setAdding("")} className="text-[13px] text-muted-foreground hover:text-foreground">+ Add a line</button>
        : <input autoFocus value={adding} placeholder="Line as printed" aria-label="New line"
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setAdding(null); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            onBlur={() => { const p = (adding ?? "").trim(); if (p && !lines.some((l) => l.printed.toLowerCase() === p.toLowerCase())) setLines((ls) => [...ls, { printed: p, kind: "sales", category: "other", settlesTo: null, bankAccountId: null, amounts: {} }]); setAdding(null); }}
            className="h-9 w-full rounded-md border-0 px-2 text-[14px] outline-none" style={{ background: "#EEF0EE" }} />)}

      {checks.length > 0 && (checks.every((x) => x.c.ok)
        ? <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "#E7F3EC", color: "#15803D" }}>
            <Check className="h-4 w-4" />Sales and payments balance on {checks.length === 1 ? "the report" : `all ${checks.length} reports`}
          </div>
        : <div className="space-y-1 rounded-lg px-3 py-2 text-[13px]" style={{ background: "#FBF1E6", color: "#B45309" }}>
            {checks.filter((x) => !x.c.ok).map(({ s, c }) => <p key={s.id}>{shortDate(s.date)}: {c.reason}</p>)}
          </div>)}

      {lines.length > 0 && <Button className="w-full sm:w-auto" onClick={save} disabled={saving}>{saving ? "Saving…" : confirmedAt ? "Save changes" : "Confirm setup"}</Button>}
    </div>
  );
}
