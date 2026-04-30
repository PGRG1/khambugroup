import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

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
  ledger_rebuild_start: "Rebuild started",
  ledger_rebuild_finish: "Rebuild finished",
  payroll_accrual: "Payroll accrual",
  payroll_net_payment: "Salary payment",
  payroll_mpf_payment: "MPF remittance",
  payroll_skipped: "Payroll skipped",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  in_progress: "secondary",
  skipped: "outline",
  error: "destructive",
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
    <div className="w-full mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">
            <span className="text-gradient-gold">Ledger Audit Log</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Every ledger rebuild and payroll-driven journal entry — most recent 500 events
          </p>
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filter by event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {Object.entries(EVENT_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="card-glass rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading audit log...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Employee / Venue</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell>{EVENT_LABELS[r.event_type] || r.event_type}</TableCell>
                  <TableCell className="text-xs">{r.user_display_name || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {r.employee_name || "—"}
                    {r.venue ? <span className="text-muted-foreground"> · {r.venue}</span> : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.period || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.amount !== null ? Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] || "outline"} className="capitalize">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.notes || ""}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No audit entries yet. Trigger a ledger rebuild from Finance → Journal.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
