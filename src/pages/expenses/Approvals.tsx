import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useExpenseBills } from "@/hooks/useExpenseBills";
import { useVendorStatements } from "@/hooks/useVendorStatements";
import { CheckCircle2, XCircle } from "lucide-react";

const fmt = (n: number) =>
  `HK$ ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function ExpenseApprovals() {
  const { bills, setStatus } = useExpenseBills();

  const pending = useMemo(() => bills.filter((b) => b.approval_status === "pending_review"), [bills]);
  const { statements } = useVendorStatements();
  const pendingStmts = useMemo(() => statements.filter((s) => s.approval_status === "pending_review"), [statements]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold">Expense Approvals</h1>
        <p className="text-sm text-muted-foreground">Bills and statements awaiting approval.</p>
      </div>

      <Card className="p-0">
        <div className="p-4 border-b text-sm font-medium">Bills awaiting approval ({pending.length})</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Bill #</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{dt(b.bill_date)}</TableCell>
                <TableCell>{b.vendor_name || "—"}</TableCell>
                <TableCell>{b.bill_number || "—"}</TableCell>
                <TableCell className="text-right td-num">{fmt(b.total_amount)}</TableCell>
                <TableCell><Badge variant="outline">{b.approval_status}</Badge></TableCell>
                <TableCell className="space-x-2">
                  <Button size="sm" variant="outline" onClick={() => setStatus(b.id, "approved")}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(b.id, "rejected")}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!pending.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No bills pending</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-0">
        <div className="p-4 border-b text-sm font-medium">Statements awaiting approval ({pendingStmts.length})</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Statement #</TableHead>
              <TableHead className="text-right">Current Charges</TableHead>
              <TableHead className="text-right">Late Fees</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingStmts.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{dt(s.statement_date)}</TableCell>
                <TableCell>{s.vendor_name || "—"}</TableCell>
                <TableCell>{s.statement_number || "—"}</TableCell>
                <TableCell className="text-right td-num">{fmt(s.current_period_charges)}</TableCell>
                <TableCell className="text-right td-num">{fmt(s.late_fees)}</TableCell>
              </TableRow>
            ))}
            {!pendingStmts.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No statements pending</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
