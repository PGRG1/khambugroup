import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFinanceBooks } from "@/hooks/useFinanceBooks";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { PageTop } from "@/components/kit/PageTop";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowRight, Send, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  formatCurrency,
  formatMonthLabel,
  formatTableInteger,
} from "@/utils/format";
import {
  canCloseMonth,
  probablyMisreadDate,
  type MonthCheck,
} from "@/utils/financeClose";
import { toast } from "sonner";
export default function FinanceDashboard() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const books = useFinanceBooks(year);
  const period = usePeriodFilter(
    books.entries.map((e) => e.entry_date),
    "all",
  );
  const { isPreviewActive } = usePreviewMode();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [confirm, setConfirm] = useState<{
    check: MonthCheck;
    close: boolean;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const needs = useMemo(() => {
    const posted = new Set(
      books.entries.filter((e) => e.status === "posted").map((e) => e.id),
    );
    const invoicePosted = new Set(
      books.entries
        .filter((e) => e.status === "posted" && e.source_type === "invoice")
        .map((e) => e.source_id),
    );
    const bills = books.bills.filter(
      (b) =>
        ["draft", "pending_review"].includes(b.approval_status) &&
        period.inPeriod(b.bill_date),
    );
    const missing = books.lines.filter(
      (l) =>
        (l.mapping_status === "missing" || !l.account_id) &&
        period.inPeriod(
          books.entries.find((e) => e.id === l.entry_id)?.entry_date,
        ),
    );
    const first = books.sales.map((s) => s.date).sort()[0];
    const dates = books.entries.filter(
      (e) =>
        e.status === "posted" &&
        probablyMisreadDate(e.entry_date, first, today),
    );
    const unposted =
      books.invoices.filter(
        (i) =>
          i.review_status === "Approved" &&
          !invoicePosted.has(i.id) &&
          period.inPeriod(i.invoice_date),
      ).length +
      books.bills.filter(
        (b) =>
          b.approval_status === "approved" &&
          !posted.has(b.journal_entry_id) &&
          period.inPeriod(b.bill_date),
      ).length;
    return [
      {
        count: bills.length,
        label: `${formatTableInteger(bills.length)} bills waiting for approval · ${formatCurrency(bills.reduce((s, b) => s + Number(b.total_amount), 0))}`,
        link: "/expenses?status=waiting",
      },
      {
        count: missing.length,
        label: `${formatTableInteger(missing.length)} journal lines with no account`,
        link: "/finance/books?view=ledger",
      },
      {
        count: dates.length,
        label: `${formatTableInteger(dates.length)} posted entries with probably misread dates`,
        link: "/finance/books?view=journal",
      },
      {
        count: unposted,
        label: `${formatTableInteger(unposted)} approved items not posted`,
        link: "/finance/payables",
      },
    ].filter((x) => x.count > 0);
  }, [books, period.fromIso, period.toIso, today]);
  async function ask() {
    if (!question.trim() || !books.tenantId) return;
    setAsking(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "finance-review",
        {
          body: {
            tenant_id: books.tenantId,
            instruction: question,
            year,
            mode: "question",
          },
        },
      );
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setAnswer(data.answer);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not answer");
    } finally {
      setAsking(false);
    }
  }
  async function setClosed() {
    if (!confirm || !books.tenantId || isPreviewActive) return;
    setSaving(true);
    const { error } = await supabase.rpc("finance_set_month_closed", {
      p_tenant_id: books.tenantId,
      p_month: `${confirm.check.month}-01`,
      p_close: confirm.close,
      p_reason: reason || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(confirm.close ? "Month closed" : "Month reopened");
    setConfirm(null);
    await books.refetch();
  }
  return (
    <div className="space-y-5 min-w-0">
      <PageTop
        title="Finance"
        period={period.control}
        actions={
          <Button
            size="icon"
            variant="outline"
            aria-label="Refresh Finance"
            onClick={() => books.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />
      {books.error && (
        <p role="alert" className="text-destructive">
          {books.error}
        </p>
      )}
      {needs.length > 0 && (
        <Card className="card-glass p-5">
          <h2 className="font-display text-lg">Needs you</h2>
          <p className="text-sm text-muted-foreground mb-3">
            {period.label} · {formatTableInteger(needs.length)} checks
          </p>
          {needs.map((n) => (
            <Link
              className="flex items-center justify-between gap-3 py-3 border-t border-border text-sm"
              key={n.link}
              to={n.link}
            >
              <span>{n.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          ))}
        </Card>
      )}
      <Card className="card-glass p-4 sm:p-5 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">Month close · {year}</h2>
            <p className="text-sm text-muted-foreground">
              {books.loading
                ? "Loading books…"
                : `${books.checks.filter((c) => c.complete).length} complete · ${books.closed.filter((c) => !c.reopened_at && c.month_start.startsWith(String(year))).length} closed`}
            </p>
          </div>
          <Select
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
          >
            <SelectTrigger aria-label="Month close year" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ...new Set([
                  Number(today.slice(0, 4)),
                  ...books.entries.map((e) => Number(e.entry_date.slice(0, 4))),
                ]),
              ]
                .sort((a, b) => b - a)
                .map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  "Month",
                  "Sales days",
                  "Invoices",
                  "Payroll",
                  "Rent & bills",
                  "Bank",
                  "To close",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left font-medium text-muted-foreground px-3 py-3 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {books.checks.map((c) => {
                const closed = books.closed.some(
                  (p) => p.month_start === `${c.month}-01` && !p.reopened_at,
                );
                const current = c.month >= today.slice(0, 7);
                return (
                  <tr key={c.month} className="border-t border-border">
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatMonthLabel(c.month)}
                    </td>
                    <td className="px-3 py-3 td-num">
                      {formatTableInteger(c.sales_days)}
                    </td>
                    <td className="px-3 py-3 td-num">
                      {formatTableInteger(c.invoices)}
                    </td>
                    <td className="px-3 py-3">{c.payroll ? "✓" : "missing"}</td>
                    <td className="px-3 py-3">
                      {c.rent === "complete" ? "✓" : c.rent}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {c.bank_lines
                        ? `${formatTableInteger(c.bank_lines)} loaded`
                        : "not loaded"}
                    </td>
                    <td className="px-3 py-3 min-w-40">
                      {closed
                        ? "Closed"
                        : current
                          ? "In progress"
                          : c.missing.join(", ") || "Everything in"}
                    </td>
                    <td className="px-3 py-3">
                      {closed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPreviewActive}
                          onClick={() => {
                            setReason("");
                            setConfirm({ check: c, close: false });
                          }}
                        >
                          Reopen
                        </Button>
                      ) : (
                        canCloseMonth(c, today) && (
                          <Button
                            size="sm"
                            disabled={isPreviewActive}
                            onClick={() =>
                              setConfirm({ check: c, close: true })
                            }
                          >
                            Close month
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border mt-4 pt-4">
          <div className="flex gap-2">
            <Input
              aria-label="Ask Bani about Finance"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask Bani"
            />
            <Button
              aria-label="Send Finance question"
              size="icon"
              onClick={ask}
              disabled={asking || books.loading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {asking && (
            <p className="text-sm text-muted-foreground mt-3">
              Reading the books…
            </p>
          )}
          {answer && (
            <p className="text-sm whitespace-pre-wrap mt-3">{answer}</p>
          )}
        </div>
      </Card>
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {confirm?.close ? "Close month" : "Reopen month"} ·{" "}
              {confirm && formatMonthLabel(confirm.check.month)}
            </DialogTitle>
            <DialogDescription>
              {confirm?.close
                ? "New posts and changes to posted entries in this month will be blocked until the owner reopens it."
                : "Only the owner can reopen this month. Existing posted amounts stay unchanged."}
            </DialogDescription>
          </DialogHeader>
          {!confirm?.close && (
            <Input
              aria-label="Reason for reopening"
              placeholder="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              onClick={setClosed}
              disabled={saving || (!confirm?.close && !reason.trim())}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
