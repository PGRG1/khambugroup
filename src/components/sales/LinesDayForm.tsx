import { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { SetupRow } from "@/hooks/useSalesLines";
import type { SalesLine } from "@/types/sales";
import { groupOf } from "@/utils/salesReportSetup";
import { lineTotals } from "@/utils/salesRecordChecks";
import { formatTableCurrency } from "@/utils/format";
import { basicsFromLines } from "../../../supabase/functions/_shared/setupReceipt";

const DEFERRED = ["voucher_sold", "voucher_used", "deposit_taken", "deposit_used"];
const COUNTS = ["guests", "orders"];
const field = "w-full px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

/** The day as its lines and the checks the scanner uses: total from the lines, payments against it. */
export function linesCheck(setup: SetupRow[], amounts: Record<string, string>) {
  const lines: SalesLine[] = setup.map((s) => ({ printed: s.printed_name, amount: amounts[s.printed_name]?.trim() ? Number(amounts[s.printed_name]) : null, kind: s.kind, known: true }));
  const invalid = lines.some((l) => l.amount != null && !Number.isFinite(l.amount));
  const filled = lines.filter((l) => l.amount != null && l.amount !== 0);
  const b = basicsFromLines(filled.map((l) => ({ ...l, kind: l.kind as never, known: true })));
  const total = b.totalSales ?? 0;
  const { gap } = lineTotals(filled, total);
  const deferred = filled.some((l) => DEFERRED.includes(l.kind ?? ""));
  return { lines: filled, total, gap, invalid, deferred };
}

/**
 * Type in, or fix, a day for a client set up line by line: one box per line on its report.
 * Saves through save_sales_day_lines (no accounting entry until payments are set up).
 */
export function LinesDayForm({ venues, setupFor, initial, recordId, onSaved, onClose, compact }: {
  venues: { id: string; name: string }[];
  setupFor: (venueId: string | null) => SetupRow[];
  initial?: { date?: string; venueId?: string | null; report?: string; lines?: SalesLine[] } | null;
  recordId?: string;
  onSaved: (recordId: string) => void | Promise<void>;
  onClose: () => void;
  /** Inside the sales day pop-up: no card, no venue or date pickers. */
  compact?: boolean;
}) {
  const { tenantId } = useActiveTenant();
  const [venueId, setVenueId] = useState(initial?.venueId ?? venues[0]?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [report, setReport] = useState(initial?.report ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.lines ?? []).map((l) => [l.printed, l.amount == null ? "" : String(l.amount)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const setup = useMemo(() => setupFor(venueId || null).filter((s) => s.kind !== "ignore"), [setupFor, venueId]);
  const check = linesCheck(setup, amounts);
  const canSave = !!venueId && !!date && !check.invalid && !check.deferred && check.total > 0 && !saving;

  const save = async () => {
    if (!tenantId || !canSave) return;
    setSaving(true); setError("");
    const { data, error: e } = await (supabase as any).rpc("save_sales_day_lines", {
      p_tenant: tenantId, p_record: recordId ?? null, p_venue: venueId, p_date: date, p_report: report,
      p_lines: check.lines.map((l) => ({ printed: l.printed, amount: l.amount })),
    });
    setSaving(false);
    if (e || typeof data !== "string") { setError(e?.message ?? "Could not save this day. Try again."); return; }
    await onSaved(data);
  };

  const body = <div className="space-y-4">
    {!compact && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <label className="text-xs text-muted-foreground">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} required /></label>
      <label className="text-xs text-muted-foreground">Venue<select value={venueId} onChange={(e) => setVenueId(e.target.value)} className={field}>
        {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label className="text-xs text-muted-foreground">Report #<input value={report} onChange={(e) => setReport(e.target.value)} className={field} /></label>
    </div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
      {(["Sales", "Basics", "Payments", "Other"] as const).map((g) => {
        const rows = setup.filter((s) => groupOf(s.kind as never) === g);
        if (!rows.length) return null;
        return <section key={g} className="space-y-1.5">
          <h4 className="kit-group-h">{g === "Basics" ? "Details" : g === "Payments" ? "Paid by" : g}</h4>
          {rows.map((s) => <label key={s.id} className="flex items-center justify-between gap-3 text-sm min-h-[40px]">
            <span className="truncate" dir="auto">{s.printed_name}</span>
            <input inputMode={COUNTS.includes(s.kind) ? "numeric" : "decimal"} aria-label={s.printed_name} value={amounts[s.printed_name] ?? ""}
              onChange={(e) => setAmounts((a) => ({ ...a, [s.printed_name]: e.target.value }))}
              className="kit-field w-32 text-right" />
          </label>)}
        </section>;
      })}
    </div>
    <div className="kit-divider pt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span>Total <strong className="td-num">{formatTableCurrency(check.total)}</strong></span>
      {check.total > 0 && Math.abs(check.gap) > 0.5 && <span className="text-warning">Payments are {formatTableCurrency(Math.abs(check.gap))} {check.gap < 0 ? "short" : "over"}</span>}
    </div>
    {check.invalid && <p className="text-sm text-warning">Use numbers only.</p>}
    {check.deferred && <p className="text-sm text-warning">Gift card and deposit days wait for the payments setup.</p>}
    {error && <p className="text-sm text-warning" role="alert">{error}</p>}
    <div className="flex justify-end gap-2">
      <button type="button" className="kit-btn kit-btn-secondary" disabled={saving} onClick={onClose}>Cancel</button>
      <button type="button" className="kit-btn kit-btn-primary" disabled={!canSave} onClick={save}>{saving ? "Saving…" : "Save"}</button>
    </div>
  </div>;

  if (compact) return <div className="kit">{body}</div>;
  return <div className="card-glass rounded-xl p-6 animate-fade-in kit">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2"><Plus className="h-5 w-5 text-primary" />Type in a day</h3>
      <button type="button" aria-label="Close" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-5 w-5" /></button>
    </div>
    {body}
  </div>;
}
