import { Card } from "@/components/ui/card";
import { AGE_BUCKETS } from "@/hooks/useReceivables";

type Row = { label: string; buckets: Record<string, number>; total: number };

export function AgingMatrix({ title, rows, valueLabel = "" }: { title: string; rows: Row[]; valueLabel?: string }) {
  const totals: Record<string, number> = {};
  AGE_BUCKETS.forEach((b) => (totals[b] = 0));
  let grand = 0;
  for (const r of rows) {
    for (const b of AGE_BUCKETS) totals[b] += r.buckets[b] || 0;
    grand += r.total;
  }
  const fmt = (n: number) => (n === 0 ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  return (
    <Card className="card-glass overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {valueLabel && <span className="text-xs text-muted-foreground">{valueLabel}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Account / Supplier</th>
              {AGE_BUCKETS.map((b) => (
                <th key={b} className="text-right px-3 py-2 font-medium font-mono">{b}</th>
              ))}
              <th className="text-right px-4 py-2 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {rows.length === 0 ? (
              <tr><td colSpan={AGE_BUCKETS.length + 2} className="px-4 py-8 text-center text-muted-foreground text-sm">No outstanding balances.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.label} className="hover:bg-muted/30">
                <td className="px-4 py-2">{r.label}</td>
                {AGE_BUCKETS.map((b) => (
                  <td key={b} className="px-3 py-2 text-right font-mono tabular-nums">{fmt(r.buckets[b] || 0)}</td>
                ))}
                <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted/40 font-semibold border-t-2 border-border/60">
              <tr>
                <td className="px-4 py-2 text-sm">Total</td>
                {AGE_BUCKETS.map((b) => (
                  <td key={b} className="px-3 py-2 text-right font-mono tabular-nums">{fmt(totals[b])}</td>
                ))}
                <td className="px-4 py-2 text-right font-mono tabular-nums">{fmt(grand)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
