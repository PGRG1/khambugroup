import { Fragment, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useExpenseBills, ExpenseBill, ExpenseBillAllocation } from "@/hooks/useExpenseBills";
import { useVendorStatements } from "@/hooks/useVendorStatements";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import {
  CheckCircle2,
  XCircle,
  FileQuestion,
  Ban,
  Pencil,
  FileCheck2,
  ShieldCheck,
  AlertTriangle,
  Send,
  Eye,
  Search,
  Filter as FilterIcon,
  Wrench,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader,
  StatusPill,
  StatusVariant,
  EmptyState,
  KpiGrid,
  KpiCard,
  fmtHK,
  fmtHKWhole,
  fmtDate,
  ScopeLine,
  useConfirm,
  TableSkeleton,
  approvalVariant,
  APPROVAL_LABEL,
  FormSection,
} from "@/components/expenses/shared";

const DOC_VARIANT: Record<string, { label: string; variant: StatusVariant }> = {
  not_required: { label: "No document required", variant: "muted" },
  pending: { label: "Document pending", variant: "warning" },
  received: { label: "Document received", variant: "success" },
};

type StatusFilter =
  | "pending_review"
  | "needs_posting"
  | "posted_paid"
  | "reversed"
  | "void"
  | "rejected"
  | "all";

const STATUS_FILTERS: { key: StatusFilter; label: string; tone: StatusVariant }[] = [
  { key: "pending_review", label: "Pending review", tone: "warning" },
  { key: "needs_posting", label: "Needs posting", tone: "destructive" },
  { key: "posted_paid", label: "Posted / Paid", tone: "success" },
  { key: "reversed", label: "Reversed", tone: "destructive" },
  { key: "void", label: "Void", tone: "muted" },
  { key: "rejected", label: "Rejected", tone: "destructive" },
  { key: "all", label: "All", tone: "neutral" },
];

const ANY = "__any__";

export default function ExpenseApprovals() {
  const { tenantId } = useActiveTenant();
  const {
    bills,
    loading,
    setStatus,
    setDocumentRequirement,
    postBill,
    saveBill,
    fetchAllocations,
  } = useExpenseBills();
  const { statements, setStatus: setStmtStatus, postStatement } = useVendorStatements();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [editBill, setEditBill] = useState<ExpenseBill | null>(null);
  const [editAllocs, setEditAllocs] = useState<ExpenseBillAllocation[]>([]);
  const [accountsByID, setAccountsByID] = useState<Record<string, { code: string; name: string }>>({});
  const [accountsList, setAccountsList] = useState<{ id: string; code: string; name: string }[]>([]);
  const [ruleNames, setRuleNames] = useState<Record<string, string>>({});

  // Missing-line map for bills that are approved-but-not-posted, so we can render
  // "Cannot post: N line(s) missing a GL account" inline on the row.
  const [missingLines, setMissingLines] = useState<Record<string, number>>({});

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending_review");
  const [venueFilter, setVenueFilter] = useState<string>(ANY);
  const [vendorFilter, setVendorFilter] = useState<string>(ANY);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id,code,name")
        .eq("tenant_id", tenantId)
        .order("code");
      const map: Record<string, { code: string; name: string }> = {};
      const list: { id: string; code: string; name: string }[] = [];
      (accs || []).forEach((a: any) => {
        map[a.id] = { code: a.code, name: a.name };
        list.push({ id: a.id, code: a.code, name: a.name });
      });
      setAccountsByID(map);
      setAccountsList(list);
      const { data: rules } = await supabase
        .from("expense_recurring_rules")
        .select("id,name")
        .eq("tenant_id", tenantId);
      const rmap: Record<string, string> = {};
      (rules || []).forEach((r: any) => {
        rmap[r.id] = r.name;
      });
      setRuleNames(rmap);
    })();
  }, [tenantId]);

  // Detect blocked bills: approved AND journal_entry_id null.
  const needsPostingIds = useMemo(
    () => bills.filter((b) => b.approval_status === "approved" && !b.journal_entry_id).map((b) => b.id),
    [bills]
  );

  // For each blocked bill, count allocation lines missing an account_id.
  useEffect(() => {
    if (!tenantId || needsPostingIds.length === 0) {
      setMissingLines({});
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("expense_bill_allocations")
        .select("bill_id,account_id")
        .eq("tenant_id", tenantId)
        .in("bill_id", needsPostingIds);
      const counts: Record<string, number> = {};
      needsPostingIds.forEach((id) => (counts[id] = 0));
      (data || []).forEach((row: any) => {
        if (!row.account_id) counts[row.bill_id] = (counts[row.bill_id] || 0) + 1;
      });
      // If there are simply zero allocation rows at all, that also blocks posting.
      const seen = new Set((data || []).map((r: any) => r.bill_id));
      needsPostingIds.forEach((id) => {
        if (!seen.has(id)) counts[id] = Math.max(counts[id] || 0, 1);
      });
      setMissingLines(counts);
    })();
  }, [tenantId, needsPostingIds, bills]);

  // Distinct venue / vendor for filter dropdowns
  const venueOptions = useMemo(() => {
    const s = new Set<string>();
    bills.forEach((b) => b.venue && s.add(b.venue));
    return Array.from(s).sort();
  }, [bills]);
  const vendorOptions = useMemo(() => {
    const s = new Set<string>();
    bills.forEach((b) => b.vendor_name && s.add(b.vendor_name));
    return Array.from(s).sort();
  }, [bills]);

  const matchesFilter = (b: ExpenseBill) => {
    // Status
    const isNeedsPosting = b.approval_status === "approved" && !b.journal_entry_id;
    const isPostedPaid = b.approval_status === "posted";
    switch (statusFilter) {
      case "pending_review":
        if (b.approval_status !== "pending_review") return false;
        break;
      case "needs_posting":
        if (!isNeedsPosting) return false;
        break;
      case "posted_paid":
        if (!isPostedPaid) return false;
        break;
      case "reversed":
        if (b.approval_status !== "reversed") return false;
        break;
      case "void":
        if (b.approval_status !== "void") return false;
        break;
      case "rejected":
        if (b.approval_status !== "rejected") return false;
        break;
      case "all":
        break;
    }
    if (venueFilter !== ANY && b.venue !== venueFilter) return false;
    if (vendorFilter !== ANY && b.vendor_name !== vendorFilter) return false;
    if (fromDate && b.bill_date < fromDate) return false;
    if (toDate && b.bill_date > toDate) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [
        b.vendor_name,
        b.bill_number,
        b.notes,
        b.venue,
        String(b.total_amount ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const filteredBills = useMemo(
    () =>
      bills
        .filter(matchesFilter)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bills, statusFilter, venueFilter, vendorFilter, fromDate, toDate, search]
  );

  // Counts for the filter chips (never mutated by other filters — so users can see
  // the pipeline totals at a glance).
  const pipelineCounts = useMemo(() => {
    const c = {
      pending_review: 0,
      needs_posting: 0,
      posted_paid: 0,
      reversed: 0,
      void: 0,
      rejected: 0,
    } as Record<Exclude<StatusFilter, "all">, number>;
    bills.forEach((b) => {
      if (b.approval_status === "pending_review") c.pending_review++;
      else if (b.approval_status === "approved" && !b.journal_entry_id) c.needs_posting++;
      else if (b.approval_status === "posted") c.posted_paid++;
      else if (b.approval_status === "reversed") c.reversed++;
      else if (b.approval_status === "void") c.void++;
      else if (b.approval_status === "rejected") c.rejected++;
    });
    return c;
  }, [bills]);

  // KPI aggregates
  const kpis = useMemo(() => {
    const pending = bills.filter((b) => b.approval_status === "pending_review");
    const needs = bills.filter(
      (b) => b.approval_status === "approved" && !b.journal_entry_id
    );
    const pendingVal = pending.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const needsVal = needs.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    return { pending, needs, pendingVal, needsVal };
  }, [bills]);

  const pendingStmts = useMemo(
    () =>
      statements.filter(
        (s) => s.approval_status === "pending_review" || s.approval_status === "draft"
      ),
    [statements]
  );

  /* ────────── actions ────────── */

  const doApprove = async (b: ExpenseBill) => {
    await setStatus(b.id, "approved");
  };

  const doPost = async (b: ExpenseBill) => {
    const ok = await confirm({
      title: "Post to General Ledger?",
      description:
        "This writes the bill as a journal entry in the GL. It can be reversed later, but the original entry stays as an audit record.",
      confirmLabel: "Post to GL",
    });
    if (ok) await postBill(b.id);
  };

  const openEdit = async (b: ExpenseBill) => {
    setEditBill(b);
    const allocs = await fetchAllocations(b.id);
    setEditAllocs(
      allocs.length
        ? allocs
        : [
            {
              line_no: 1,
              expense_category: null,
              account_id: null,
              venue: b.venue,
              department: b.department,
              amount: b.total_amount,
              tax_treatment: "none",
              tax_amount: 0,
              notes: null,
            },
          ]
    );
  };

  const saveOnly = async () => {
    if (!editBill) return;
    const id = await saveBill(editBill, editAllocs);
    if (id) setEditBill(null);
  };

  const saveAndApprove = async () => {
    if (!editBill) return;
    const id = await saveBill(editBill, editAllocs);
    if (id) {
      await setStatus(id, "approved");
      setEditBill(null);
    }
  };

  const saveAndPost = async () => {
    if (!editBill) return;
    const id = await saveBill(editBill, editAllocs);
    if (id) {
      if (editBill.approval_status !== "approved") await setStatus(id, "approved");
      await postBill(id);
      setEditBill(null);
    }
  };

  /* ────────── row helpers ────────── */

  const rowActions = (b: ExpenseBill) => {
    const isNeedsPosting = b.approval_status === "approved" && !b.journal_entry_id;
    const missing = missingLines[b.id] || 0;

    if (b.approval_status === "pending_review") {
      return (
        <div className="flex flex-wrap gap-1 justify-end">
          <Button size="sm" onClick={() => doApprove(b)}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => openEdit(b)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Review
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStatus(b.id, "rejected")}>
            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
          </Button>
        </div>
      );
    }
    if (isNeedsPosting) {
      return (
        <div className="flex flex-wrap gap-1 justify-end">
          {missing > 0 ? (
            <Button size="sm" variant="outline" onClick={() => openEdit(b)}>
              <Wrench className="h-3.5 w-3.5 mr-1" /> Fix allocations
            </Button>
          ) : (
            <Button size="sm" onClick={() => doPost(b)}>
              <Send className="h-3.5 w-3.5 mr-1" /> Post to GL
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>
            <Eye className="h-3.5 w-3.5 mr-1" /> View
          </Button>
        </div>
      );
    }
    return (
      <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>
        <Eye className="h-3.5 w-3.5 mr-1" /> View
      </Button>
    );
  };

  const rowStatusPill = (b: ExpenseBill) => {
    const isNeedsPosting = b.approval_status === "approved" && !b.journal_entry_id;
    if (isNeedsPosting) {
      return <StatusPill variant="destructive">Needs posting</StatusPill>;
    }
    return (
      <StatusPill variant={approvalVariant(b.approval_status)}>
        {APPROVAL_LABEL[b.approval_status] || b.approval_status}
      </StatusPill>
    );
  };

  const chipCountFor = (k: StatusFilter): number | null => {
    if (k === "all") return bills.length;
    return pipelineCounts[k] ?? 0;
  };

  const clearFilters = () => {
    setVenueFilter(ANY);
    setVendorFilter(ANY);
    setFromDate("");
    setToDate("");
    setSearch("");
  };
  const filtersActive =
    venueFilter !== ANY || vendorFilter !== ANY || fromDate || toDate || search.trim();

  /* ────────── render ────────── */

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="Review queue"
        title="Expense Approvals"
        description="Approval and posting are separate steps. Nothing lands in the ledger until it is both approved AND posted — any bill that stalls between the two shows up here as ‘Needs posting’."
      />

      <KpiGrid>
        <KpiCard
          label="Pending review"
          value={String(kpis.pending.length)}
          hint={kpis.pending.length > 0 ? fmtHKWhole(kpis.pendingVal) + " in queue" : "All clear"}
          tone={kpis.pending.length > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Needs posting"
          value={String(kpis.needs.length)}
          hint={
            kpis.needs.length > 0
              ? fmtHKWhole(kpis.needsVal) + " approved but not in GL"
              : "Nothing stuck"
          }
          tone={kpis.needs.length > 0 ? "destructive" : "default"}
          onClick={kpis.needs.length ? () => setStatusFilter("needs_posting") : undefined}
        />
        <KpiCard
          label="Statements waiting"
          value={String(pendingStmts.length)}
          hint={
            pendingStmts.length > 0
              ? fmtHKWhole(
                  pendingStmts.reduce((s, x) => s + Number(x.current_period_charges || 0), 0)
                ) + " in charges"
              : undefined
          }
          tone={pendingStmts.length > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Oldest pending"
          value={(() => {
            const today = Date.now();
            const oldest = kpis.pending.reduce((max, b) => {
              const d = Math.floor((today - new Date(b.created_at).getTime()) / 86400000);
              return d > max ? d : max;
            }, 0);
            return oldest > 0 ? `${oldest}d` : "—";
          })()}
          hint="Days since submitted"
          tone={"default"}
        />
      </KpiGrid>

      {/* Filter bar */}
      <Card className="card-glass p-3">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            const count = chipCountFor(f.key);
            return (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium border transition-colors " +
                  (active
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-muted/30 text-muted-foreground border-border/60 hover:border-primary/30 hover:text-foreground")
                }
              >
                {f.label}
                {count !== null && (
                  <span
                    className={
                      "rounded-full px-1.5 py-[1px] text-[10px] leading-none tabular-nums " +
                      (active ? "bg-primary/25" : "bg-muted-foreground/15")
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-6 items-end">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search vendor, bill #, amount, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Venue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All venues</SelectItem>
                {venueOptions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All vendors</SelectItem>
                {vendorOptions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input
              type="date"
              className="h-9"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              placeholder="From"
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="date"
              className="h-9"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="To"
            />
            {filtersActive && (
              <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Bills table */}
      <Card className="card-glass p-0 overflow-hidden">
        <div className="p-4 border-b border-border/60 flex items-center justify-between gap-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <FilterIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {STATUS_FILTERS.find((f) => f.key === statusFilter)?.label}
            <span className="text-muted-foreground">({filteredBills.length})</span>
          </div>
          <ScopeLine>Sorted oldest first</ScopeLine>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : filteredBills.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title={
              statusFilter === "pending_review"
                ? "Nothing awaiting your approval"
                : statusFilter === "needs_posting"
                ? "No approved bills stuck outside the ledger"
                : "No bills match these filters"
            }
            description={
              statusFilter === "pending_review"
                ? "Bills submitted for review from Bills & Expenses or Recurring Rules will appear here."
                : statusFilter === "needs_posting"
                ? "Any bill that is approved but has not yet reached the general ledger — typically because an allocation line is missing a GL account — will surface here so it never disappears."
                : "Try widening the date range or clearing filters."
            }
            action={
              filtersActive ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor / Bill</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBills.map((b) => {
                  const isNeedsPosting =
                    b.approval_status === "approved" && !b.journal_entry_id;
                  const missing = missingLines[b.id] || 0;
                  const isRecurring = b.source_type === "recurring_rule";
                  const doc =
                    DOC_VARIANT[b.document_requirement || "not_required"] ||
                    DOC_VARIANT.not_required;
                  return (
                    <Fragment key={b.id}>
                      <TableRow className="align-top">
                        <TableCell>
                          <div className="font-medium">{b.vendor_name || "—"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            #{b.bill_number || "—"}
                            {isRecurring &&
                              b.recurring_rule_id &&
                              ruleNames[b.recurring_rule_id] && (
                                <> · {ruleNames[b.recurring_rule_id]}</>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {b.venue || (b.combined_venues ? "Combined" : "—")}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {fmtDate(b.bill_date)}
                        </TableCell>
                        <TableCell className="text-right td-num tabular-nums whitespace-nowrap font-medium">
                          {fmtHK(b.total_amount)}
                        </TableCell>
                        <TableCell>{rowStatusPill(b)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {isRecurring && (
                              <StatusPill variant="neutral" dot={false}>
                                Recurring
                              </StatusPill>
                            )}
                            {b.combined_venues && (
                              <StatusPill variant="info" dot={false}>
                                Combined
                              </StatusPill>
                            )}
                            {b.document_requirement &&
                              b.document_requirement !== "not_required" && (
                                <StatusPill variant={doc.variant} dot={false}>
                                  {doc.label}
                                </StatusPill>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{rowActions(b)}</TableCell>
                      </TableRow>
                      {isNeedsPosting && missing > 0 && (
                        <TableRow key={b.id + "-warn"} className="bg-destructive/5 border-b">
                          <TableCell colSpan={7} className="py-2">
                            <div className="flex items-center gap-2 text-xs text-destructive">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Cannot post: {missing} allocation line
                                {missing === 1 ? "" : "s"} missing a GL account.
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 ml-auto text-xs"
                                onClick={() => openEdit(b)}
                              >
                                <Wrench className="h-3 w-3 mr-1" /> Fix allocations
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Statements queue */}
      <Card className="card-glass p-0 overflow-hidden">
        <div className="p-4 border-b border-border/60 text-sm font-medium">
          Statements awaiting approval{" "}
          <span className="text-muted-foreground">({pendingStmts.length})</span>
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Statement #</TableHead>
                <TableHead className="text-right">Current Charges</TableHead>
                <TableHead className="text-right">Late Fees</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingStmts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(s.statement_date)}</TableCell>
                  <TableCell>{s.vendor_name || "—"}</TableCell>
                  <TableCell>{s.statement_number || "—"}</TableCell>
                  <TableCell className="text-right td-num tabular-nums whitespace-nowrap">
                    {fmtHK(s.current_period_charges)}
                  </TableCell>
                  <TableCell className="text-right td-num tabular-nums whitespace-nowrap">
                    {fmtHK(s.late_fees)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={async () => {
                          const ok = await setStmtStatus(s.id, "approved");
                          if (ok) await postStatement(s.id);
                        }}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approve & Post
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => setStmtStatus(s.id, "rejected")}
                      >
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!pendingStmts.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No statements pending
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Edit / Fix allocations sheet */}
      <Sheet open={!!editBill} onOpenChange={(o) => !o && setEditBill(null)}>
        <SheetContent className="w-full sm:max-w-[720px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editBill?.approval_status === "approved" && !editBill?.journal_entry_id
                ? "Fix allocations & Post"
                : editBill?.approval_status === "pending_review"
                ? "Review Bill"
                : "View Bill"}
            </SheetTitle>
          </SheetHeader>
          {editBill && (
            <div className="space-y-4 mt-4">
              <FormSection title="Bill" description="Header details for this expense.">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Vendor</Label>
                    <Input
                      value={editBill.vendor_name || ""}
                      onChange={(e) =>
                        setEditBill({ ...editBill, vendor_name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Bill #</Label>
                    <Input
                      value={editBill.bill_number || ""}
                      onChange={(e) =>
                        setEditBill({ ...editBill, bill_number: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Bill Date</Label>
                    <Input
                      type="date"
                      value={editBill.bill_date}
                      onChange={(e) =>
                        setEditBill({ ...editBill, bill_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Total</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editBill.total_amount}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setEditBill({ ...editBill, total_amount: v, subtotal: v });
                        setEditAllocs((p) =>
                          p.length === 1 ? p.map((a) => ({ ...a, amount: v })) : p
                        );
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={editBill.notes || ""}
                      onChange={(e) =>
                        setEditBill({ ...editBill, notes: e.target.value })
                      }
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection
                title="Allocation lines"
                description="Every line must have a GL account before it can be posted to the ledger."
              >
                <div className="space-y-2">
                  {editAllocs.map((a, idx) => {
                    const missing = !a.account_id;
                    return (
                      <div
                        key={idx}
                        className={
                          "grid grid-cols-12 gap-2 items-center p-2 rounded-lg border " +
                          (missing
                            ? "border-destructive/40 bg-destructive/5"
                            : "border-border/60 bg-muted/20")
                        }
                      >
                        <div className="col-span-1 text-xs text-muted-foreground tabular-nums">
                          #{idx + 1}
                        </div>
                        <div className="col-span-6">
                          <Select
                            value={a.account_id || ""}
                            onValueChange={(v) =>
                              setEditAllocs((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, account_id: v || null } : x
                                )
                              )
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select GL account…" />
                            </SelectTrigger>
                            <SelectContent>
                              {accountsList.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.code} — {acc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3">
                          <Input
                            placeholder="Venue"
                            value={a.venue || ""}
                            onChange={(e) =>
                              setEditAllocs((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, venue: e.target.value || null } : x
                                )
                              )
                            }
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={a.amount}
                            onChange={(e) =>
                              setEditAllocs((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, amount: Number(e.target.value) } : x
                                )
                              )
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </FormSection>
              {/* Readiness checklist — mirrors the DB approval-gate trigger. */}
              {editBill.approval_status !== "posted" &&
                editBill.approval_status !== "reversed" &&
                editBill.approval_status !== "void" &&
                (() => {
                  const vendorLinked = !!editBill.supplier_id;
                  const grandfathered = editBill.approval_status === "approved" && !editBill.supplier_id;
                  const allocsHaveCategory = editAllocs.length > 0 && editAllocs.every((a) => (a.expense_category || "").trim() !== "");
                  const allocsHaveAccount = editAllocs.length > 0 && editAllocs.every((a) => !!a.account_id);
                  const allocTotal = editAllocs.reduce((s, a) => s + Number(a.amount || 0), 0);
                  const expected = Number(editBill.subtotal || 0) || Number(editBill.total_amount || 0);
                  const allocsBalance = editAllocs.length > 0 && Math.abs(allocTotal - expected) < 0.01;
                  const items = [
                    { pass: vendorLinked, grandfathered, label: "Vendor linked to master data" },
                    { pass: allocsHaveCategory, label: "Every allocation line has a category" },
                    { pass: allocsHaveAccount, label: "Every allocation line has a GL account" },
                    { pass: allocsBalance, label: "Allocations balance to subtotal" },
                  ];
                  return (
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                        Readiness to approve
                      </div>
                      <ul className="space-y-2 text-sm">
                        {items.map((it, i) => {
                          const amber = !it.pass && it.grandfathered;
                          const ok = it.pass && !amber;
                          return (
                            <li key={i} className="flex items-start gap-2">
                              {ok ? (
                                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                              ) : (
                                <AlertTriangle className={"h-4 w-4 mt-0.5 shrink-0 " + (amber ? "text-warning" : "text-warning")} />
                              )}
                              <div className={amber ? "text-warning" : "text-foreground"}>
                                {it.label}
                                {amber && (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    — approved before vendor linking was required
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()}

              
              <div className="flex justify-end gap-2 pt-4 border-t border-border/60">
                <Button variant="outline" onClick={() => setEditBill(null)}>
                  Cancel
                </Button>
                {editBill.approval_status !== "posted" &&
                  editBill.approval_status !== "reversed" && (
                    <>
                      <Button variant="outline" onClick={saveOnly}>
                        Save
                      </Button>
                      {editBill.approval_status === "pending_review" && (
                        <Button variant="outline" onClick={saveAndApprove}>
                          Save & Approve
                        </Button>
                      )}
                      <Button onClick={saveAndPost}>
                        <Send className="h-4 w-4 mr-1" />
                        Save & Post to GL
                      </Button>
                    </>
                  )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </div>
  );
}
