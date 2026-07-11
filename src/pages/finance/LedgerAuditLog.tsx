import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Loader2, SkipForward, RefreshCw, Coins, Wallet, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditRow {
  id: string;
  event_type: string;
  user_display_name: string | null;
  payroll_id: string | null;
  journal_entry_id: string | null;
  venue: string | null;
  employee_name: string | null;
  period: string | null;
  amount: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  ledger_rebuild_start: "Ledger rebuild started",
  ledger_rebuild_finish: "Ledger rebuild finished",
  payroll_accrual: "Payroll accrual",
  payroll_net_payment: "Salary payment",
  payroll_mpf_payment: "MPF remittance",
  payroll_skipped: "Payroll skipped",
  invoice_payment_posted: "Invoice payment posted",
  payroll_batch_posted: "Payroll batch posted",
  credit_note_applied: "Credit note applied",
  bank_fee_posted: "Bank fee posted",
  journal_entry_edited: "Journal entry edited",
};

const fmt = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtAbsDate = (iso: string) => {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${date} · ${time}`;
  } catch { return iso; }
};

const fmtRelative = (iso: string) => {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
};

function eventIcon(eventType: string, status: string) {
  // Status-driven tone; icon by event category
  const tone =
    status === "success" ? "text-primary bg-primary/10 border-primary/20"
      : status === "error" ? "text-destructive bg-destructive/10 border-destructive/20"
      : status === "in_progress" ? "text-warning bg-warning/10 border-warning/20"
      : "text-muted-foreground bg-muted border-border";

  let Icon: any = ClipboardList;
  if (eventType.startsWith("ledger_rebuild")) Icon = RefreshCw;
  else if (eventType === "payroll_accrual") Icon = ClipboardList;
  else if (eventType === "payroll_net_payment") Icon = Wallet;
  else if (eventType === "payroll_mpf_payment") Icon = Coins;
  else if (eventType === "payroll_skipped") Icon = SkipForward;

  if (status === "success") Icon = eventType.startsWith("ledger_rebuild") ? RefreshCw : Icon;
  if (status === "error") Icon = XCircle;
  if (status === "in_progress") Icon = Loader2;

  return { Icon, tone };
}

const STATUS_LABEL: Record<string, string> = {
  success: "Success",
  in_progress: "In progress",
  skipped: "Skipped",
  error: "Error",
};

const STATUS_TONE: Record<string, string> = {
  success: "bg-primary/10 text-primary border border-primary/20",
  in_progress: "bg-warning/10 text-warning border border-warning/20",
  skipped: "bg-muted text-muted-foreground border border-border",
  error: "bg-destructive/10 text-destructive border border-destructive/20",
};

export default function LedgerAuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = (supabase as any)
        .from("ledger_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (eventFilter !== "all") q = q.eq("event_type", eventFilter);
      const { data } = await q;
      setRows((data as AuditRow[]) || []);
      setLoading(false);
    })();
  }, [eventFilter]);

  return (
    <div className="p-4 sm:p-6 w-full max-w-[1200px] mx-auto space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Ledger Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every ledger rebuild and payroll-driven journal entry — most recent 500 events.
          </p>
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[240px]">
            <SelectValue placeholder="Filter by event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {Object.entries(EVENT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="card-glass p-4"><Skeleton className="h-14 w-full" /></Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="card-glass p-10 text-center">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No audit entries yet</p>
          <p className="text-xs text-muted-foreground mt-1">Trigger a ledger rebuild from Finance → Journal to see events here.</p>
        </Card>
      ) : (
        <ol className="relative border-l border-border/60 ml-3 space-y-4">
          {rows.map((r) => {
            const { Icon, tone } = eventIcon(r.event_type, r.status);
            const isSpin = r.status === "in_progress";
            return (
              <li key={r.id} className="pl-6">
                <span className={cn("absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full border", tone)}>
                  <Icon className={cn("h-3 w-3", isSpin && "animate-spin")} />
                </span>
                <Card className="card-glass p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{EVENT_LABELS[r.event_type] || r.event_type}</span>
                        <span className={cn("text-[10px] uppercase px-2 py-0.5 rounded-full tracking-wide", STATUS_TONE[r.status] || STATUS_TONE.skipped)}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </div>
                      {r.notes && <p className="text-sm mt-1 text-foreground/90">{r.notes}</p>}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2">
                        {r.employee_name && <span>👤 {r.employee_name}</span>}
                        {r.venue && <span>· {r.venue}</span>}
                        {r.period && <span>· Period <span className="font-mono">{r.period}</span></span>}
                        {r.user_display_name && <span>· by {r.user_display_name}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {r.amount !== null && (
                        <div className="text-sm font-semibold tabular-nums">HK$ {fmt(Number(r.amount))}</div>
                      )}
                      <div className="text-[11px] text-foreground/80 mt-0.5">{fmtRelative(r.created_at)}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtAbsDate(r.created_at)}</div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
