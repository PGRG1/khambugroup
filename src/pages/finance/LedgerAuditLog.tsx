import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Loader2, SkipForward, RefreshCw, Coins, Wallet, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import {fetchAllRows} from "@/utils/fetchAllRows";
import {formatDate,formatMenuCurrency} from "@/utils/format";
import {Link} from "react-router-dom";

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
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>("all");

  useEffect(() => {
    if (tenantLoading) return;
    if (!tenantId) { setRows([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const data=await fetchAllRows('ledger_audit_log','*',{col:'created_at',asc:false},tenantId);
      setRows((data as AuditRow[]).filter(r=>eventFilter==='all'||r.event_type===eventFilter));
      setLoading(false);
    })();
  }, [eventFilter, tenantId, tenantLoading]);

  return (
    <div className="p-4 sm:p-6 w-full max-w-[1200px] mx-auto space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recorded ledger events
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

      <section className="kit card-glass overflow-hidden"><div className="p-4"><h2 className="font-semibold">Audit</h2><p className="text-sm text-muted-foreground">{rows.length} recorded events</p></div><table className="w-full table-fixed text-sm"><thead><tr><th className="p-4 w-[24%] text-left">Date</th><th className="text-left">What changed</th><th className="w-[22%] text-left">Who</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-border/50"><td className="p-4 align-top">{formatDate(r.created_at)}</td><td className="py-4 pr-3 break-words">{EVENT_LABELS[r.event_type]??r.event_type.replace(/_/g,' ')}<p className="text-xs text-muted-foreground">{r.notes}</p>{r.journal_entry_id&&<Link className="text-primary underline text-xs" to={`/finance/books?view=journal&entry=${r.journal_entry_id}`}>Entry</Link>}</td><td className="pr-4 align-top py-4 break-words">{r.user_display_name??'Not recorded'}<p className="text-xs text-muted-foreground">{STATUS_LABEL[r.status]??r.status}</p></td></tr>)}</tbody></table>{!rows.length&&<p className="p-8 text-center text-muted-foreground">{loading?'Loading audit…':'No audit records.'}</p>}</section>

    </div>
  );
}
