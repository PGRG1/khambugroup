import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/format";
import { lineOptions } from "@/utils/salesReportSetup";
import { mappingOf, type Suggestion } from "../../../supabase/functions/_shared/newReportLines";
import { salesOutcomeMessage } from "@/utils/salesSaveResult";

// Payments land in a bank or cash for now; which bank account is part of the later payments setup.
const OPTIONS = lineOptions([]);
const labelOf = (v: string) => OPTIONS.find((o) => o.value === v)?.label ?? v;

/** Bani's suggestion for each new line, one answer each, then the report is checked again. */
export function NewLinesAnswer({ tenantId, intakeId, onDone }: { tenantId: string; intakeId: string; onDone: (saved: boolean) => void }) {
  const q = useQuery({ queryKey: ["new-line-suggestions", tenantId, intakeId], staleTime: 300_000, retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("parse-receipt", { body: { op: "suggest_new_lines", tenantId, intakeId } });
      if (error || !Array.isArray(data?.lines)) throw new Error(data?.error ?? "Bani could not look at these lines");
      return data.lines as Suggestion[];
    } });
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    // Bani's guess is preselected only when it is sure; otherwise the person chooses.
    if (q.data) setPicked(Object.fromEntries(q.data.filter((s) => s.sure).map((s) => [s.printed, s.value])));
  }, [q.data]);

  if (q.isPending) return <p className="text-sm text-muted-foreground">Bani is looking at the new lines…</p>;
  if (q.isError) return <p className="text-sm text-warning">{(q.error as Error).message}. Try again.</p>;
  if (!q.data.length) return null;
  const ready = q.data.every((s) => picked[s.printed]);

  const save = async () => {
    setBusy(true); setResult("");
    for (const s of q.data) {
      const m = mappingOf(picked[s.printed]);
      if (!m) { setBusy(false); setResult(`Choose what ${s.printed} is.`); return; }
      const { error } = await (supabase as any).rpc("map_new_sales_line", { p_intake: intakeId, p_printed: s.printed, p_kind: m.kind, p_category: m.category, p_settles_to: m.settlesTo });
      if (error) { setBusy(false); setResult(error.message); return; }
    }
    const { data, error } = await supabase.functions.invoke("parse-receipt", { body: { op: "recheck_intake", tenantId, intakeId } });
    setBusy(false);
    if (error || !data) { setResult("Saved what the lines are. The report could not be checked again; try again."); return; }
    if (data.status === "saved") { setResult(salesOutcomeMessage({ status: "saved", recordId: data.recordId, journal: "none" })); setSaved(true); onDone(true); return; }
    const reasons = Array.isArray(data.reasons) ? data.reasons.map(String) : [];
    setResult(reasons.length ? `Learned. Still kept for review: ${reasons.slice(0, 3).join("; ")}.` : data.error ?? "Learned. Still kept for review.");
    onDone(false);
  };

  return (
    <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <p className="text-sm font-medium">{q.data.length === 1 ? "What is this line?" : "What are these lines?"} Bani will remember for every future report.</p>
      {q.data.map((s) => (
        <div key={s.printed} className="space-y-1.5 border-t border-border/60 pt-3 first:border-0 first:pt-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium" dir="auto">{s.printed}</span>
            {s.amount != null && <span className="td-num text-sm">{formatCurrency(s.amount)}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {s.sure ? `Looks like ${labelOf(s.value)}` : `Bani isn't sure. Best guess: ${labelOf(s.value)}`}{s.reason ? ` · ${s.reason}` : ""}
          </p>
          {!s.sure && <div className="flex flex-wrap gap-2">
            {[s.value, ...s.alternatives].map((v) => (
              <button key={v} type="button" onClick={() => setPicked((p) => ({ ...p, [s.printed]: v }))}
                className={`rounded-full border px-3 py-1 text-xs ${picked[s.printed] === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>{labelOf(v)}</button>
            ))}
          </div>}
          <select aria-label={`What ${s.printed} is`} value={picked[s.printed] ?? ""} onChange={(e) => setPicked((p) => ({ ...p, [s.printed]: e.target.value }))}
            className="w-full rounded-md border border-border bg-background p-2 text-sm">
            <option value="" disabled>Something else…</option>
            {(["Sales", "Payments", "Basics", "Other"] as const).map((g) => (
              <optgroup key={g} label={g}>{OPTIONS.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
            ))}
          </select>
        </div>
      ))}
      {result && <p className="text-sm" role="status">{result}</p>}
      {!saved && <Button size="sm" disabled={!ready || busy} onClick={save}>{busy ? "Checking…" : "Save and check again"}</Button>}
    </div>
  );
}
