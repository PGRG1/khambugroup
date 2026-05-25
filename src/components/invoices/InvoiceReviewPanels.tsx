import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  Sparkles,
  Info,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

/* ───────────────────────── Types reused from InvoiceScanner ───────────────── */

export interface ReviewCorrectionLite {
  field: string;
  original: string;
  corrected: string;
  reason: string;
  confidence: number;
}

export interface LineForReview {
  description: string;
  item_code: string;
  unit: string;
  quantity: string;
  unit_price: string;
  matched_sku: string;
  matched_internal_name: string;
  review_status?: "matched" | "possible_match" | "new_item" | "needs_review";
  review_warnings?: string[];
  review_blocking?: string[];
  review_corrections?: ReviewCorrectionLite[];
  review_candidates?: string[];
  review_match_reason?: string;
  review_match_confidence?: number;
  unmatched?: boolean;
  sku_mismatch?: boolean;
  price_changed?: boolean;
  suggested_new_item?: any;
}

export interface InvoiceForReview {
  invoice_number: string;
  is_duplicate?: boolean;
  duplicate_date?: string;
  review_warnings?: string[];
  review_blocking?: string[];
  review_corrections?: ReviewCorrectionLite[];
  line_items: LineForReview[];
}

/* ─────────────────────────── Aggregate stats helper ───────────────────────── */

export interface ReviewStats {
  totalLines: number;
  matched: number;
  newItems: number;
  autoCorrections: number;
  warnings: number;
  blocking: number;

  headerCheckStatus: "passed" | "warning" | "blocking";
  supplierCheckStatus: "passed" | "warning" | "blocking";
  mathCheckStatus: "passed" | "warning" | "blocking";
  itemMappingStatus: "passed" | "warning" | "blocking";

  headerCheckMsg: string;
  supplierCheckMsg: string;
  mathCheckMsg: string;
  itemMappingMsg: string;
}

export function computeReviewStats(
  inv: InvoiceForReview,
  opts: { totalMismatch?: boolean } = {}
): ReviewStats {
  const lines = inv.line_items || [];

  const headerCorr = inv.review_corrections?.length || 0;
  const lineCorr = lines.reduce((s, l) => s + (l.review_corrections?.length || 0), 0);
  const headerWarn = inv.review_warnings?.length || 0;
  const lineWarn = lines.reduce((s, l) => s + (l.review_warnings?.length || 0), 0);
  const headerBlock = inv.review_blocking?.length || 0;
  const lineBlock = lines.reduce((s, l) => s + (l.review_blocking?.length || 0), 0);

  const matched = lines.filter((l) => l.review_status === "matched").length;
  const newItems = lines.filter((l) => l.review_status === "new_item").length;
  const blockingLines = lines.filter((l) => (l.review_blocking?.length || 0) > 0).length;

  // Header check: any header-level correction/warning/blocking on fields like invoice_number/invoice_date/due_date
  const headerFields = ["invoice_number", "invoice_date", "due_date"];
  const headerCorrCount = (inv.review_corrections || []).filter((c) =>
    headerFields.some((f) => c.field?.toLowerCase().includes(f))
  ).length;
  const headerHasBlock = (inv.review_blocking || []).some((m) =>
    headerFields.some((f) => m.toLowerCase().startsWith(`${f}:`))
  );
  const headerHasWarn = (inv.review_warnings || []).some((m) =>
    headerFields.some((f) => m.toLowerCase().startsWith(`${f}:`))
  );
  const headerCheckStatus: ReviewStats["headerCheckStatus"] = headerHasBlock
    ? "blocking"
    : headerHasWarn
    ? "warning"
    : "passed";
  const headerCheckMsg = headerHasBlock
    ? "Blocking issue"
    : headerHasWarn
    ? "Review required"
    : headerCorrCount > 0
    ? `${headerCorrCount} auto-corrected`
    : "Passed";

  // Supplier check
  const supplierHasBlock = (inv.review_blocking || []).some((m) =>
    m.toLowerCase().startsWith("supplier_name:")
  );
  const supplierHasWarn = (inv.review_warnings || []).some((m) =>
    m.toLowerCase().startsWith("supplier_name:")
  );
  const supplierCorrCount = (inv.review_corrections || []).filter((c) =>
    c.field?.toLowerCase().includes("supplier")
  ).length;
  const supplierCheckStatus: ReviewStats["supplierCheckStatus"] = supplierHasBlock
    ? "blocking"
    : supplierHasWarn
    ? "warning"
    : "passed";
  const supplierCheckMsg = supplierHasBlock
    ? "Blocking issue"
    : supplierHasWarn
    ? "Review required"
    : supplierCorrCount > 0
    ? "Auto-corrected"
    : "Passed";

  // Math check
  const mathCheckStatus: ReviewStats["mathCheckStatus"] = opts.totalMismatch ? "warning" : "passed";
  const mathCheckMsg = opts.totalMismatch ? "Total mismatch" : "Passed";

  // Item mapping
  const itemMappingStatus: ReviewStats["itemMappingStatus"] =
    blockingLines > 0 ? "blocking" : newItems > 0 || lineWarn > 0 ? "warning" : "passed";
  const itemMappingParts: string[] = [];
  if (matched > 0) itemMappingParts.push(`${matched} matched`);
  if (newItems > 0) itemMappingParts.push(`${newItems} new`);
  if (blockingLines > 0) itemMappingParts.push(`${blockingLines} blocking`);
  const itemMappingMsg = itemMappingParts.length > 0 ? itemMappingParts.join(" · ") : "Passed";

  return {
    totalLines: lines.length,
    matched,
    newItems,
    autoCorrections: headerCorr + lineCorr,
    warnings: headerWarn + lineWarn,
    blocking: headerBlock + lineBlock,
    headerCheckStatus,
    supplierCheckStatus,
    mathCheckStatus,
    itemMappingStatus,
    headerCheckMsg,
    supplierCheckMsg,
    mathCheckMsg,
    itemMappingMsg,
  };
}

export function getLineStatus(line: LineForReview): {
  label: string;
  variant: "matched" | "auto" | "warn" | "block" | "new" | "review";
} {
  if ((line.review_blocking?.length || 0) > 0) return { label: "Blocking Issue", variant: "block" };
  if (line.review_status === "new_item") return { label: "New Item", variant: "new" };
  if ((line.review_warnings?.length || 0) > 0 || line.price_changed)
    return { label: "Warning", variant: "warn" };
  if ((line.review_corrections?.length || 0) > 0)
    return { label: "Auto-corrected", variant: "auto" };
  if (line.review_status === "possible_match") return { label: "Possible Match", variant: "warn" };
  if (line.review_status === "needs_review" || line.unmatched)
    return { label: "Needs Review", variant: "review" };
  if (line.review_status === "matched" || line.matched_sku)
    return { label: "Matched", variant: "matched" };
  return { label: "—", variant: "review" };
}

/* ─────────────────────────── Status / chip primitives ─────────────────────── */

const chipBase =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border";

const chipVariants: Record<string, string> = {
  matched: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  auto: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  block: "bg-destructive/10 text-destructive border-destructive/30",
  new: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  review: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function LineStatusChip({ variant, label }: { variant: keyof typeof chipVariants; label: string }) {
  return <span className={`${chipBase} ${chipVariants[variant]} whitespace-nowrap`}>{label}</span>;
}

/* ─────────────────────────── Inline correction chip ───────────────────────── */

export function CorrectionChip({
  corrections,
  fieldAliases,
  warnings,
  blocking,
}: {
  corrections?: ReviewCorrectionLite[];
  fieldAliases: string[];
  warnings?: string[];
  blocking?: string[];
}) {
  const matchedCorr = (corrections || []).filter((c) =>
    fieldAliases.some((f) => c.field?.toLowerCase().includes(f))
  );
  const hasWarn = (warnings || []).some((m) =>
    fieldAliases.some((f) => m.toLowerCase().startsWith(`${f}:`))
  );
  const hasBlock = (blocking || []).some((m) =>
    fieldAliases.some((f) => m.toLowerCase().startsWith(`${f}:`))
  );

  if (!matchedCorr.length && !hasWarn && !hasBlock) return null;
  const title = matchedCorr
    .map((c) => `${c.field}: "${c.original}" → "${c.corrected}" (${c.reason})`)
    .join("\n");

  if (hasBlock) {
    return (
      <span className={`${chipBase} ${chipVariants.block} mt-1`} title={title || undefined}>
        <XCircle className="h-2.5 w-2.5" /> Blocking
      </span>
    );
  }
  if (hasWarn) {
    return (
      <span className={`${chipBase} ${chipVariants.warn} mt-1`} title={title || undefined}>
        <AlertTriangle className="h-2.5 w-2.5" /> Warning
      </span>
    );
  }
  return (
    <span className={`${chipBase} ${chipVariants.auto} mt-1`} title={title || undefined}>
      <Sparkles className="h-2.5 w-2.5" /> Auto-corrected
    </span>
  );
}

/* ─────────────────────────── Workflow strip ───────────────────────────────── */

export function WorkflowStrip({
  extractorDone,
  reviewerDone,
  blocking,
  duplicate,
}: {
  extractorDone: boolean;
  reviewerDone: boolean;
  blocking: number;
  duplicate?: boolean;
}) {
  const Step = ({
    title,
    sub,
    state,
    Icon,
  }: {
    title: string;
    sub: string;
    state: "done" | "pending" | "blocked";
    Icon: React.ComponentType<{ className?: string }>;
  }) => {
    const color =
      state === "done"
        ? "text-emerald-600 dark:text-emerald-400"
        : state === "blocked"
        ? "text-destructive"
        : "text-muted-foreground";
    return (
      <div className="flex items-center gap-2 min-w-[150px]">
        <Icon className={`h-5 w-5 ${color}`} />
        <div className="leading-tight">
          <div className="text-xs font-semibold text-foreground">{title}</div>
          <div className={`text-[10px] ${color}`}>{sub}</div>
        </div>
      </div>
    );
  };

  const humanState: "done" | "pending" | "blocked" = duplicate
    ? "blocked"
    : blocking > 0
    ? "blocked"
    : "pending";

  return (
    <div className="flex items-center gap-1 flex-wrap rounded-lg border border-border bg-card/50 px-3 py-2">
      <Step
        title="AI Extractor"
        sub={extractorDone ? "Completed" : "Pending"}
        state={extractorDone ? "done" : "pending"}
        Icon={extractorDone ? CheckCircle2 : Clock}
      />
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
      <Step
        title="AI Reviewer"
        sub={reviewerDone ? "Completed" : "Skipped"}
        state={reviewerDone ? "done" : "pending"}
        Icon={reviewerDone ? CheckCircle2 : Clock}
      />
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
      <Step
        title="Human Approval"
        sub={
          duplicate
            ? "Duplicate blocked"
            : blocking > 0
            ? `${blocking} blocking issue${blocking > 1 ? "s" : ""}`
            : "Ready to approve"
        }
        state={humanState}
        Icon={humanState === "blocked" ? XCircle : Clock}
      />
    </div>
  );
}

/* ─────────────────────────── Check cards ──────────────────────────────────── */

export function CheckCard({
  title,
  status,
  message,
}: {
  title: string;
  status: "passed" | "warning" | "blocking";
  message: string;
}) {
  const config = {
    passed: {
      Icon: CheckCircle2,
      iconClass: "text-emerald-500",
      label: "Passed",
      borderClass: "border-border",
    },
    warning: {
      Icon: AlertTriangle,
      iconClass: "text-amber-500",
      label: "Warning",
      borderClass: "border-amber-500/40",
    },
    blocking: {
      Icon: XCircle,
      iconClass: "text-destructive",
      label: "Blocking",
      borderClass: "border-destructive/40",
    },
  }[status];
  const Icon = config.Icon;
  return (
    <div className={`rounded-lg border ${config.borderClass} bg-card px-3 py-2.5 flex items-center gap-2.5`}>
      <Icon className={`h-5 w-5 shrink-0 ${config.iconClass}`} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground truncate">{title}</div>
        <div className="text-[11px] text-muted-foreground truncate">{message}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────── KPI strip ────────────────────────────────────── */

export function KpiStrip({ stats }: { stats: ReviewStats }) {
  const Item = ({
    label,
    value,
    tone = "neutral",
  }: {
    label: string;
    value: number;
    tone?: "neutral" | "good" | "warn" | "bad" | "info";
  }) => {
    const toneClass =
      tone === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
        ? "text-destructive"
        : tone === "info"
        ? "text-sky-600 dark:text-sky-400"
        : "text-foreground";
    return (
      <div className="px-3 py-2 min-w-[100px]">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
      </div>
    );
  };

  return (
    <div className="flex items-center divide-x divide-border rounded-lg border border-border bg-card overflow-x-auto">
      <Item label="Total Items" value={stats.totalLines} />
      <Item label="Matched" value={stats.matched} tone="good" />
      <Item label="Auto-corrected" value={stats.autoCorrections} tone="info" />
      <Item label="Warnings" value={stats.warnings} tone="warn" />
      <Item label="Blocking" value={stats.blocking} tone="bad" />
      <Item label="New Items" value={stats.newItems} tone="info" />
    </div>
  );
}

/* ─────────────────────────── Review drawer (per line) ─────────────────────── */

export function ReviewDrawer({
  open,
  onClose,
  line,
  lineNumber,
  onAddItem,
  isAdding,
}: {
  open: boolean;
  onClose: () => void;
  line: LineForReview | null;
  lineNumber: number | null;
  onAddItem?: () => void;
  isAdding?: boolean;
}) {
  if (!line || lineNumber === null) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md" />
      </Sheet>
    );
  }

  const status = getLineStatus(line);
  const conf = line.review_match_confidence;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">
              Line {lineNumber} <LineStatusChip variant={status.variant} label={status.label} />
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs truncate">
            {line.matched_internal_name || line.description || "—"}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="review" className="mt-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="history">Extracted</TabsTrigger>
          </TabsList>

          <TabsContent value="review" className="space-y-4 mt-4">
            {/* Issue summary */}
            {(line.review_blocking?.length || line.review_warnings?.length) ? (
              <Section title="Issue">
                <ul className="text-xs space-y-1 text-foreground">
                  {(line.review_blocking || []).map((m, i) => (
                    <li key={`b${i}`} className="flex gap-1.5">
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                      <span>{m}</span>
                    </li>
                  ))}
                  {(line.review_warnings || []).map((m, i) => (
                    <li key={`w${i}`} className="flex gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {/* AI Recommendation / match reason */}
            {line.review_match_reason && (
              <Section title="AI Recommendation">
                <p className="text-xs text-muted-foreground">{line.review_match_reason}</p>
              </Section>
            )}

            {/* Auto-corrections table */}
            {line.review_corrections && line.review_corrections.length > 0 && (
              <Section title="Auto-corrections">
                <div className="space-y-1.5">
                  {line.review_corrections.map((c, i) => (
                    <div key={i} className="rounded border border-border bg-muted/30 p-2 text-xs">
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">
                        {c.field}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="line-through text-muted-foreground">{c.original || "—"}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{c.corrected || "—"}</span>
                      </div>
                      {c.reason && <div className="text-[11px] text-muted-foreground mt-1">{c.reason}</div>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Candidates */}
            {line.review_candidates && line.review_candidates.length > 0 && (
              <Section title="Considered Candidates">
                <ul className="text-xs text-muted-foreground list-disc list-inside">
                  {line.review_candidates.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Confidence */}
            {typeof conf === "number" && (
              <Section title="Match Confidence">
                <Progress value={Math.round((conf || 0) * 100)} className="h-1.5" />
                <div className="text-[11px] text-muted-foreground mt-1 text-right">
                  {Math.round((conf || 0) * 100)}%
                </div>
              </Section>
            )}

            {/* Action required */}
            {line.review_status === "new_item" && onAddItem && !line.matched_sku && (
              <Section title="Action Required">
                <p className="text-xs text-muted-foreground mb-2">
                  This item isn't in your Items Master yet. Add it to continue.
                </p>
                <Button onClick={onAddItem} disabled={isAdding} className="w-full">
                  {isAdding ? "Adding..." : "Add to Items Master"}
                </Button>
              </Section>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3 mt-4">
            <Section title="Extracted Values">
              <KV label="External SKU" value={line.item_code} />
              <KV label="External Name" value={line.description} />
              <KV label="Unit" value={line.unit} />
              <KV label="Qty" value={line.quantity} />
              <KV label="Unit Price" value={line.unit_price} />
            </Section>
            <Section title="Matched In Items Master">
              <KV label="Internal SKU" value={line.matched_sku || "—"} />
              <KV label="Internal Name" value={line.matched_internal_name || "—"} />
            </Section>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 font-semibold">
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground text-right truncate max-w-[60%]">{value || "—"}</span>
    </div>
  );
}
