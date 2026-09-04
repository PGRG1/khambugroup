export type ReviewIssueSeverity = "warning" | "blocking" | "review";

export interface ReviewIssue {
  id: string;
  severity: ReviewIssueSeverity;
  scope: "header" | "line";
  message: string;
  label: string;
  field: string;
  lineIdx?: number;
}

export interface ReviewIssueLine {
  description?: string;
  unit_price?: string | number;
  master_price?: number;
  unmatched?: boolean;
  price_changed?: boolean;
  review_warnings?: string[];
  review_blocking?: string[];
}

export interface ReviewIssueInvoice {
  review_warnings?: string[];
  review_blocking?: string[];
  line_items?: ReviewIssueLine[];
}

const HEADER_FIELDS = new Set([
  "supplier_name", "supplier", "venue", "invoice_number", "invoice_date", "due_date", "total_amount", "subtotal",
]);
const LINE_FIELDS = new Set([
  "item_code", "description", "quantity", "unit", "unit_price", "discount", "total",
]);

function fieldFromMessage(message: string, allowed: Set<string>, fallback: string): string {
  const token = message.split(":")[0]?.trim().toLowerCase().replace(/\s+/g, "_") || "";
  return allowed.has(token) ? token : fallback;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * One entry per actual finding — header and line findings are never collapsed together,
 * so counts, navigation and the summary all read from the same source.
 */
export function buildReviewIssues(invoice: ReviewIssueInvoice | null | undefined): ReviewIssue[] {
  if (!invoice) return [];
  const issues: ReviewIssue[] = [];

  (invoice.review_blocking || []).forEach((message, i) => {
    issues.push({
      id: `header-blocking-${i}`,
      severity: "blocking",
      scope: "header",
      message,
      label: "Header",
      field: fieldFromMessage(message, HEADER_FIELDS, "supplier_name"),
    });
  });
  (invoice.review_warnings || []).forEach((message, i) => {
    issues.push({
      id: `header-warning-${i}`,
      severity: "warning",
      scope: "header",
      message,
      label: "Header",
      field: fieldFromMessage(message, HEADER_FIELDS, "supplier_name"),
    });
  });

  (invoice.line_items || []).forEach((line, lineIdx) => {
    const label = `Line ${lineIdx + 1}`;
    const messages = [
      ...(line.review_blocking || []).map((m) => ({ m, severity: "blocking" as const, kind: "blocking" })),
      ...(line.review_warnings || []).map((m) => ({ m, severity: "warning" as const, kind: "warning" })),
    ];
    messages.forEach(({ m, severity, kind }, i) => {
      issues.push({
        id: `line-${lineIdx}-${kind}-${i}`,
        severity,
        scope: "line",
        message: m,
        label,
        field: `line-${lineIdx}-${fieldFromMessage(m, LINE_FIELDS, "description")}`,
        lineIdx,
      });
    });

    const allText = messages.map((x) => x.m.toLowerCase()).join(" | ");
    if (line.unmatched && !/match/.test(allText)) {
      issues.push({
        id: `line-${lineIdx}-unmatched`,
        severity: "review",
        scope: "line",
        message: "No Item Master match has been confirmed.",
        label,
        field: `line-${lineIdx}-description`,
        lineIdx,
      });
    }
    if (line.price_changed && !/price/.test(allText)) {
      const invoicePrice = toNumber(line.unit_price);
      const masterPrice = toNumber(line.master_price);
      const message = invoicePrice !== null && masterPrice !== null
        ? `Price differs from Item Master — invoice ${invoicePrice.toFixed(2)} vs master ${masterPrice.toFixed(2)}.`
        : "Price differs from the Item Master price.";
      issues.push({
        id: `line-${lineIdx}-price`,
        severity: "review",
        scope: "line",
        message,
        label,
        field: `line-${lineIdx}-unit_price`,
        lineIdx,
      });
    }
  });

  return issues;
}

export function issueToneClasses(severity: ReviewIssueSeverity): string {
  return severity === "blocking"
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400";
}
