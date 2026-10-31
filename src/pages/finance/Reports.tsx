import { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useFinanceBooks } from "@/hooks/useFinanceBooks";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { useVenueScope } from "@/hooks/useVenueScope";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { PageTop } from "@/components/kit/PageTop";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { ChevronDown, ChevronRight, Download, FileText } from "lucide-react";
import { formatCurrency, formatMonthLabel } from "@/utils/format";
import {
  bookAmount,
  plGroup,
  reportMonths,
  type BookAccount,
  type MonthCheck,
  type TypedLine,
} from "@/utils/financeClose";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadCSV } from "@/utils/csvDownload";
import {
  generateLedgerPLPDF,
  generateBalanceSheetPDF,
  generateCashflowPDF,
  type LedgerPLRow,
} from "@/utils/financePdfReports";
import {
  classifyCashMovement,
  SECTION_ORDER,
  SECTION_LABELS,
} from "@/utils/cashflowStatementClassifier";
import PLReport from "@/pages/PLReport";
export default function Reports() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "pl";
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const books = useFinanceBooks(year);
  const scope = useVenueScope();
  const period = usePeriodFilter(
    [
      ...books.entries.map((e) => e.entry_date),
      ...books.typed
        .filter((l) => l.month)
        .map((l) => `${l.year}-${String(l.month).padStart(2, "0")}-01`),
    ],
    "MTD",
  );
  const { isPreviewActive } = usePreviewMode();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [conversion, setConversion] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [counter, setCounter] = useState("");
  const [busy, setBusy] = useState(false);
  const [management, setManagement] = useState(false);
  const [extraChecks, setExtraChecks] = useState<MonthCheck[]>([]);
  const months = useMemo(
    () =>
      reportMonths(
        [
          ...books.entries.map((e) => e.entry_date),
          ...books.typed
            .filter((l) => l.month)
            .map((l) => `${l.year}-${String(l.month).padStart(2, "0")}-01`),
        ],
        period.fromIso,
        period.toIso,
      ),
    [books.entries, books.typed, period.fromIso, period.toIso],
  );
  const checks = [...books.checks, ...extraChecks];
  const missingMonths = months
    .map((m) => checks.find((c) => c.month === m))
    .filter((c) => c && !c.complete) as MonthCheck[];
  const posted = new Map(
    books.entries.filter((e) => e.status === "posted").map((e) => [e.id, e]),
  );
  const acc = new Map(books.accounts.map((a) => [a.id, a]));
  const scoped = books.lines.filter(
    (l) => posted.has(l.entry_id) && scope.includesName(l.venue),
  );
  const amount = (a: BookAccount, m: string, venue?: string) =>
    scoped
      .filter(
        (l) =>
          l.account_id === a.id &&
          posted.get(l.entry_id)?.entry_date.startsWith(m) &&
          (!venue || l.venue === venue),
      )
      .reduce((s, l) => s + bookAmount(l, a), 0);
  const total = (group: string, m: string, venue?: string) =>
    books.accounts
      .filter((a) => plGroup(a.account_type) === group)
      .reduce((s, a) => s + amount(a, m, venue), 0);
  const profit = (m: string, venue?: string) =>
    total("Sales", m, venue) -
    total("Cost of sales", m, venue) -
    total("Running costs", m, venue);
  const converted = new Set(
    books.links
      .filter((l) => posted.has(l.journal_entry_id))
      .map((l) => l.manual_line_id),
  );
  const typed = books.typed.filter(
    (l) =>
      l.month &&
      months.includes(`${l.year}-${String(l.month).padStart(2, "0")}`),
  );
  const unconverted = typed.filter((l) => !converted.has(l.id));
  const typedSum = (m: string) =>
    unconverted
      .filter((l) => `${l.year}-${String(l.month).padStart(2, "0")}` === m)
      .reduce((s, l) => s + Number(l.amount), 0);
  const convertLines = unconverted.filter(
    (l) =>
      `${l.year}-${String(l.month).padStart(2, "0")}` === conversion &&
      Number(l.amount) !== 0,
  );
  async function loadYear(y: number) {
    setYear(y);
  }
  async function openConvert(m: string) {
    setConversion(m);
    setPicks({});
    setCounter("");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "finance-review",
        {
          body: {
            tenant_id: books.tenantId,
            instruction:
              "Suggest P&L accounts for these typed line names; do not post.",
            mode: "accounts",
            year: Number(m.slice(0, 4)),
            month: m,
          },
        },
      );
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setPicks(
        Object.fromEntries(
          data.suggestions
            .filter((s: any) => s.account_id)
            .map((s: any) => [s.line_id, s.account_id]),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Choose accounts manually");
    } finally {
      setBusy(false);
    }
  }
  async function convert() {
    if (!conversion || !books.tenantId || isPreviewActive) return;
    setBusy(true);
    const { error } = await supabase.rpc("finance_convert_typed_month", {
      p_tenant_id: books.tenantId,
      p_month: `${conversion}-01`,
      p_counter_account: counter,
      p_lines: convertLines.map((l) => ({
        id: l.id,
        name: l.line_item_name,
        amount: Number(l.amount),
        account_id: picks[l.id],
      })),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Typed adjustments posted; original lines retained");
    setConversion(null);
    await books.refetch();
  }
  const to = period.toIso ?? `${year}-12-31`;
  const from =
    period.fromIso ??
    books.entries.map((e) => e.entry_date).sort()[0] ??
    `${year}-01-01`;
  const balance = (a: BookAccount) =>
    scoped
      .filter(
        (l) =>
          l.account_id === a.id &&
          (posted.get(l.entry_id)?.entry_date ?? "9999") <= to,
      )
      .reduce(
        (s, l) =>
          s +
          (a.account_type === "asset"
            ? Number(l.debit) - Number(l.credit)
            : Number(l.credit) - Number(l.debit)),
        0,
      );
  const balanceSections = ["asset", "liability", "equity"].map((type) => ({
    type,
    label:
      type === "asset"
        ? "Assets"
        : type === "liability"
          ? "Liabilities"
          : "Equity",
    accounts: books.accounts
      .filter((a) => a.account_type === type)
      .map((a) => ({ ...a, total: balance(a) }))
      .filter((a) => Math.abs(a.total) > 0.005),
  }));
  const retained = scoped
    .filter(
      (l) =>
        (posted.get(l.entry_id)?.entry_date ?? "9999") <= to &&
        plGroup(acc.get(l.account_id ?? "")?.account_type ?? ""),
    )
    .reduce((s, l) => {
      const a = acc.get(l.account_id ?? "");
      return a
        ? s +
            (["revenue", "other_income"].includes(a.account_type)
              ? bookAmount(l, a)
              : -bookAmount(l, a))
        : s;
    }, 0);
  const cash = useMemo(() => {
    let opening = 0;
    const map = new Map<
      string,
      {
        section: "operating" | "investing" | "financing";
        lineItem: string;
        amount: number;
      }
    >();
    for (const l of scoped) {
      const a = acc.get(l.account_id ?? "");
      const e = posted.get(l.entry_id);
      if (!a?.is_cash || !e || e.entry_date > to) continue;
      const n = Number(l.debit) - Number(l.credit);
      if (e.entry_date < from) {
        opening += n;
        continue;
      }
      const counters = books.lines
        .filter(
          (x) =>
            x.entry_id === l.entry_id && !acc.get(x.account_id ?? "")?.is_cash,
        )
        .map((x) => acc.get(x.account_id ?? ""))
        .filter((a): a is BookAccount => !!a);
      const c = classifyCashMovement(counters, n > 0 ? 1 : -1);
      const k = c.section + "|" + c.lineItem;
      const row = map.get(k) ?? {
        section: c.section,
        lineItem: c.lineItem.replace("customers", "guests"),
        amount: 0,
      };
      row.amount += n;
      map.set(k, row);
    }
    return {
      opening,
      rows: [...map.values()],
      net: [...map.values()].reduce((s, r) => s + r.amount, 0),
    };
  }, [books.lines, books.entries, books.accounts, scope.label, from, to]);
  const pdfRows: LedgerPLRow[] = [
    "Sales",
    "Cost of sales",
    "Running costs",
    "Profit",
  ].map((group) => ({
    label: group,
    depth: 0,
    isComputed: true,
    cells: months.map((m) =>
      group === "Profit" ? profit(m) : total(group, m),
    ),
  }));
  pdfRows.push({
    label: "Adjustments (typed, not in books)",
    depth: 0,
    cells: months.map(typedSum),
  });
  missingMonths.forEach((c) =>
    pdfRows.push({
      label: `${formatMonthLabel(c.month)} incomplete: ${c.missing.join(", ")}`,
      depth: 0,
      isSection: true,
      cells: [],
    }),
  );
  function pdf() {
    if (view === "cash") {
      const totals = { operating: 0, investing: 0, financing: 0 };
      cash.rows.forEach((r) => (totals[r.section] += r.amount));
      generateCashflowPDF({
        fromDate: from,
        toDate: to,
        venueLabel: scope.label,
        opening: cash.opening,
        closing: cash.opening + cash.net,
        netChange: cash.net,
        sectionTotals: totals,
        linesBySection: {
          operating: cash.rows.filter((r) => r.section === "operating"),
          investing: cash.rows.filter((r) => r.section === "investing"),
          financing: cash.rows.filter((r) => r.section === "financing"),
        },
        cashAccounts: books.accounts
          .filter((a) => a.is_cash)
          .map((a) => ({
            code: a.code,
            name: a.name,
            balance: scoped
              .filter(
                (l) =>
                  l.account_id === a.id &&
                  (posted.get(l.entry_id)?.entry_date ?? "9999") <= to,
              )
              .reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0),
          })),
      });
      return;
    }
    if (view === "bs") {
      const sec = (i: number) => ({
        title: balanceSections[i].label,
        accounts: balanceSections[i].accounts,
        subtotal: balanceSections[i].accounts.reduce((s, a) => s + a.total, 0),
      });
      const assets = sec(0),
        liabilities = sec(1),
        equity = sec(2);
      generateBalanceSheetPDF({
        asOf: to,
        assets,
        liabilities,
        equity,
        retainedEarnings: retained,
        totalEquity: equity.subtotal + retained,
        totalLE: liabilities.subtotal + equity.subtotal + retained,
        balanced:
          Math.abs(
            assets.subtotal - liabilities.subtotal - equity.subtotal - retained,
          ) < 0.01,
      });
      return;
    }
    generateLedgerPLPDF({
      periodLabel: period.label,
      columns: months.map((m) => ({ key: m, label: formatMonthLabel(m) })),
      rows: pdfRows,
      showGrandTotal: false,
    });
  }
  function csv() {
    const rows =
      view === "bs"
        ? balanceSections.flatMap((s) =>
            s.accounts.map((a) => ({
              line: `${s.label} · ${a.code} ${a.name}`,
              amount: a.total,
            })),
          )
        : view === "cash"
          ? [
              { line: "Opening cash", amount: cash.opening },
              ...cash.rows.map((r) => ({ line: r.lineItem, amount: r.amount })),
              { line: "Closing cash", amount: cash.opening + cash.net },
            ]
          : pdfRows
              .filter((r) => !r.isSection)
              .flatMap((r) =>
                r.cells.map((amount, i) => ({
                  line: `${months[i]} · ${r.label}`,
                  amount,
                })),
              );
    downloadCSV(
      rows,
      [
        { key: "line", label: "Line" },
        { key: "amount", label: "Amount" },
      ],
      `finance_${view}`,
    );
  }
  return (
    <div className="space-y-5 min-w-0">
      <PageTop
        title="Reports"
        period={period.control}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label="Download report"
              title="Download CSV"
              onClick={csv}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Download PDF"
              title="Download PDF"
              onClick={pdf}
            >
              <FileText className="h-4 w-4" />
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap border-b border-border gap-1">
        {[
          ["pl", "P&L"],
          ["bs", "Balance sheet"],
          ["cash", "Cash flow"],
          ["venue", "By venue"],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant="ghost"
            className={`rounded-none border-b-2 ${view === key ? "border-primary" : "border-transparent"}`}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("view", key);
              setParams(next);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {books.error && (
        <p role="alert" className="text-destructive">
          {books.error}
        </p>
      )}
      {(view === "pl" || view === "venue") && missingMonths.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm">
          {missingMonths.map((c) => formatMonthLabel(c.month)).join(", ")} are
          not complete:{" "}
          {[...new Set(missingMonths.flatMap((c) => c.missing))].join(", ")}, so
          running costs and profit are not real yet.
        </div>
      )}
      <Card className="card-glass p-4 sm:p-5 min-w-0">
        <h2 className="font-display text-lg">
          {view === "bs"
            ? "Balance sheet"
            : view === "cash"
              ? "Cash flow"
              : view === "venue"
                ? "P&L · By venue"
                : "Profit & loss"}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {period.label} · {scope.label} ·{" "}
          {books.loading ? "Loading books…" : "Posted journal entries"}
        </p>
        {view === "pl" || view === "venue" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left p-3 min-w-44">Account</th>
                  {months.map((m) => (
                    <th key={m} className="text-left p-3 whitespace-nowrap">
                      {formatMonthLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(view === "venue"
                  ? [...new Set(scoped.map((l) => l.venue ?? "Unassigned"))]
                  : [""]
                ).flatMap((venue) =>
                  ["Sales", "Cost of sales", "Running costs", "Profit"].map(
                    (group) => {
                      const key = venue + group;
                      const open = expanded.includes(key);
                      return (
                        <tbody key={key}>
                          {venue && group === "Sales" && (
                            <tr>
                              <td
                                colSpan={months.length + 1}
                                className="p-3 font-semibold bg-muted"
                              >
                                {venue}
                              </td>
                            </tr>
                          )}
                          <tr className="border-t border-border font-medium">
                            <td className="p-3">
                              {group !== "Profit" ? (
                                <Button
                                  variant="ghost"
                                  className="px-0 h-7"
                                  onClick={() =>
                                    setExpanded(
                                      open
                                        ? expanded.filter((k) => k !== key)
                                        : [...expanded, key],
                                    )
                                  }
                                >
                                  {open ? (
                                    <ChevronDown className="h-4 w-4 mr-2" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 mr-2" />
                                  )}
                                  {group}
                                </Button>
                              ) : (
                                group
                              )}
                            </td>
                            {months.map((m) => (
                              <td
                                key={m}
                                className="p-3 td-num whitespace-nowrap"
                              >
                                {formatCurrency(
                                  group === "Profit"
                                    ? profit(m, venue || undefined)
                                    : total(group, m, venue || undefined),
                                )}
                              </td>
                            ))}
                          </tr>
                          {open &&
                            books.accounts
                              .filter((a) => plGroup(a.account_type) === group)
                              .filter((a) =>
                                months.some(
                                  (m) => amount(a, m, venue || undefined) !== 0,
                                ),
                              )
                              .map((a) => (
                                <tr
                                  key={a.id}
                                  className="border-t border-border text-muted-foreground"
                                >
                                  <td className="p-3 pl-9">
                                    {a.code} · {a.name}
                                  </td>
                                  {months.map((m) => (
                                    <td
                                      key={m}
                                      className="p-3 td-num whitespace-nowrap"
                                    >
                                      {formatCurrency(
                                        amount(a, m, venue || undefined),
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                        </tbody>
                      );
                    },
                  ),
                )}
                <tr className="border-t border-border">
                  <td className="p-3 font-medium">Complete?</td>
                  {months.map((m) => {
                    const c = checks.find((c) => c.month === m);
                    return (
                      <td key={m} className="p-3 min-w-36 text-xs">
                        {c ? (
                          c.complete ? (
                            "yes"
                          ) : (
                            c.missing.join(", ")
                          )
                        ) : (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={async () => {
                              if (!books.tenantId) return;
                              const { data, error } = await supabase.rpc(
                                "finance_month_checks",
                                {
                                  p_tenant_id: books.tenantId,
                                  p_month: `${m}-01`,
                                },
                              );
                              if (error) toast.error(error.message);
                              else
                                setExtraChecks((c) => [
                                  ...c,
                                  data as unknown as MonthCheck,
                                ]);
                            }}
                          >
                            Check {formatMonthLabel(m)}
                          </Button>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {view === "pl" && (
                  <>
                    <tr className="border-t border-border">
                      <td className="p-3 font-medium">Adjustments (typed)</td>
                      {months.map((m) => (
                        <td key={m} className="p-3 td-num">
                          {formatCurrency(typedSum(m))}
                        </td>
                      ))}
                    </tr>
                    {[...new Set(typed.map((l) => l.line_item_name))].map(
                      (name) => (
                        <tr
                          key={name}
                          className="border-t border-border text-muted-foreground"
                        >
                          <td className="p-3 pl-9">{name}</td>
                          {months.map((m) => (
                            <td key={m} className="p-3 td-num">
                              {formatCurrency(
                                unconverted
                                  .filter(
                                    (l) =>
                                      l.line_item_name === name &&
                                      `${l.year}-${String(l.month).padStart(2, "0")}` ===
                                        m,
                                  )
                                  .reduce((s, l) => s + Number(l.amount), 0),
                              )}
                            </td>
                          ))}
                        </tr>
                      ),
                    )}
                    <tr>
                      <td className="p-3" />
                      <>
                        {months.map((m) => (
                          <td key={m} className="p-3">
                            {unconverted.some(
                              (l) =>
                                `${l.year}-${String(l.month).padStart(2, "0")}` ===
                                  m && l.amount !== 0,
                            ) && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPreviewActive}
                                onClick={() => openConvert(m)}
                              >
                                Turn into journal entries
                              </Button>
                            )}
                          </td>
                        ))}
                      </>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        ) : view === "bs" ? (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-3">Account</th>
                <th className="text-left p-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {balanceSections.map((s) => (
                <tbody key={s.type}>
                  <tr className="border-t border-border font-semibold">
                    <td className="p-3">{s.label}</td>
                    <td className="p-3 td-num">
                      {formatCurrency(
                        s.accounts.reduce((n, a) => n + a.total, 0) +
                          (s.type === "equity" ? retained : 0),
                      )}
                    </td>
                  </tr>
                  {s.accounts.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="p-3">
                        {a.code} · {a.name}
                      </td>
                      <td className="p-3 td-num">{formatCurrency(a.total)}</td>
                    </tr>
                  ))}
                  {s.type === "equity" && (
                    <tr>
                      <td className="p-3">Retained earnings (computed)</td>
                      <td className="p-3 td-num">{formatCurrency(retained)}</td>
                    </tr>
                  )}
                </tbody>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-3">Cash movement</th>
                <th className="text-left p-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3">Opening cash</td>
                <td className="p-3 td-num">{formatCurrency(cash.opening)}</td>
              </tr>
              {SECTION_ORDER.map((s) => (
                <tbody key={s}>
                  <tr className="border-t border-border font-semibold">
                    <td className="p-3">{SECTION_LABELS[s]}</td>
                    <td className="p-3 td-num">
                      {formatCurrency(
                        cash.rows
                          .filter((r) => r.section === s)
                          .reduce((n, r) => n + r.amount, 0),
                      )}
                    </td>
                  </tr>
                  {cash.rows
                    .filter((r) => r.section === s)
                    .map((r) => (
                      <tr className="border-t border-border" key={r.lineItem}>
                        <td className="p-3">{r.lineItem}</td>
                        <td className="p-3 td-num">
                          {formatCurrency(r.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="p-3">Closing cash</td>
                <td className="p-3 td-num">
                  {formatCurrency(cash.opening + cash.net)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {view === "pl" && (
          <div className="border-t border-border pt-4 mt-4 text-sm">
            <p className="text-muted-foreground">
              Typed lines are preserved, not included in book profit until
              converted. Converted lines are already in the books; no double
              counting. Company-wide adjustments have no venue attribution.
            </p>
            {books.typed.some((l) => l.month === null) && (
              <p className="text-warning mt-2">
                Annual typed lines have no month; they remain in the management
                report and are not assigned automatically.
              </p>
            )}
            <Button
              variant="link"
              className="px-0"
              onClick={() => setManagement(true)}
            >
              Management P&L · typed lines & PDF
            </Button>
          </div>
        )}
      </Card>
      <Dialog
        open={!!conversion}
        onOpenChange={(o) => !o && setConversion(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Turn into journal entries ·{" "}
              {conversion && formatMonthLabel(conversion)}
            </DialogTitle>
            <DialogDescription>
              Original typed lines stay saved. Review each account and choose
              the balancing account; only Confirm posts these adjustments.
            </DialogDescription>
          </DialogHeader>
          {busy && (
            <p className="text-sm text-muted-foreground">Reading line names…</p>
          )}
          {convertLines.map((l) => (
            <div
              key={l.id}
              className="grid sm:grid-cols-2 gap-2 border-t border-border py-3"
            >
              <div className="text-sm">
                {l.line_item_name}
                <div className="td-num">{formatCurrency(Number(l.amount))}</div>
              </div>
              <Select
                value={picks[l.id] || "pick"}
                onValueChange={(v) => setPicks((p) => ({ ...p, [l.id]: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pick" disabled>
                    Pick an account
                  </SelectItem>
                  {books.accounts
                    .filter((a) => !!plGroup(a.account_type))
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <label className="text-sm">Balancing account</label>
          <Select value={counter || "pick"} onValueChange={setCounter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pick" disabled>
                Pick the counterpart account
              </SelectItem>
              {books.accounts
                .filter((a) =>
                  ["asset", "liability", "equity"].includes(a.account_type),
                )
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConversion(null)}>
              Cancel
            </Button>
            <Button
              onClick={convert}
              disabled={
                busy || !counter || convertLines.some((l) => !picks[l.id])
              }
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={management} onOpenChange={setManagement}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Management P&L</DialogTitle>
            <DialogDescription>
              Original management report · typed lines retained
            </DialogDescription>
          </DialogHeader>
          <PLReport />
        </DialogContent>
      </Dialog>
    </div>
  );
}
