import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { formatCurrency } from "@/utils/salesUtils";
import { usePettyCash } from "@/hooks/usePettyCash";
import { PettyCashHeader, KpiTile, StatusBadge, fmtDate, healthColor } from "./_shared";

export default function PettyCashOverviewPage() {
  const pc = usePettyCash();

  if (pc.loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
        <PettyCashHeader title="Petty Cash" subtitle="Physical cash floats, receipts and replenishments per venue." />
        <Card className="card-glass p-10 text-center text-muted-foreground">Loading petty cash…</Card>
      </div>
    );
  }

  const totalFloatValue = pc.floats.reduce((s, f) => s + Number(f.float_amount || 0), 0);
  const totalOnHand = pc.floats.reduce((s, f) => s + (pc.balanceByFloat[f.id] ?? 0), 0);
  const pendingReceipts = pc.receipts.filter((r) => r.status === "pending");
  const pendingAmount = pendingReceipts.reduce((s, r) => s + Number(r.amount), 0);
  const belowThreshold = pc.floats.filter((f) => (pc.balanceByFloat[f.id] ?? 0) < Number(f.replenish_threshold));
  const recentReceipts = pc.receipts.slice(0, 8);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      <PettyCashHeader title="Petty Cash" subtitle="Physical cash floats, receipts and replenishments per venue." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Total float value" value={formatCurrency(totalFloatValue)} sub={`${pc.floats.length} floats`} />
        <KpiTile label="Cash on hand (est.)" value={formatCurrency(totalOnHand)} sub="Replen − posted receipts" />
        <KpiTile label="Pending receipts" value={String(pendingReceipts.length)} sub={formatCurrency(pendingAmount)} tone={pendingReceipts.length ? "warn" : undefined} />
        <KpiTile label="Below threshold" value={String(belowThreshold.length)} sub={belowThreshold.length ? "Needs replenishment" : "All healthy"} tone={belowThreshold.length ? "bad" : "good"} />
      </div>

      <Card className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Floats</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/petty-cash/floats">Manage floats</Link>
          </Button>
        </div>
        {pc.floats.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No floats yet. Create one under the Floats tab.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pc.floats.map((f) => {
              const bal = pc.balanceByFloat[f.id] ?? 0;
              return (
                <div key={f.id} className="rounded-lg border border-border p-3 bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{f.venue}</div>
                    </div>
                    <Wallet className={`h-4 w-4 ${healthColor(bal, Number(f.replenish_threshold))}`} />
                  </div>
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground">Balance</div>
                    <div className={`text-lg font-semibold ${healthColor(bal, Number(f.replenish_threshold))}`}>{formatCurrency(bal)}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Target {formatCurrency(f.float_amount)} · Replenish ≤ {formatCurrency(f.replenish_threshold)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Recent receipts</h2>
          <Button asChild size="sm" variant="outline"><Link to="/petty-cash/receipts">All receipts</Link></Button>
        </div>
        {recentReceipts.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No receipts recorded yet.</div>
        ) : (
          <div className="text-sm">
            <div className="grid grid-cols-[90px_1fr_140px_100px_90px] gap-3 text-xs text-muted-foreground border-b border-border pb-2">
              <span>Date</span><span>Description</span><span>Classification</span><span className="text-right">Amount</span><span className="text-right">Status</span>
            </div>
            {recentReceipts.map((r) => {
              const cls = pc.classifications.find((c) => c.id === r.classification_id);
              return (
                <div key={r.id} className="grid grid-cols-[90px_1fr_140px_100px_90px] gap-3 py-2 border-b border-border/50 items-center">
                  <span className="text-xs">{fmtDate(r.receipt_date)}</span>
                  <span className="truncate">{r.description}</span>
                  <span className="text-xs">{cls?.name ?? "—"}</span>
                  <span className="text-right">{formatCurrency(r.amount)}</span>
                  <span className="text-right"><StatusBadge status={r.status} /></span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
