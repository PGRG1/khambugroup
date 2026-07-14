import { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** HK$ money formatter — HK$ prefix, en-HK grouping, tabular alignment via `td-num`. */
export const fmtHK = (n: number, digits = 2) =>
  `HK$ ${(Number.isFinite(n) ? n : 0).toLocaleString("en-HK", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

/** Whole-HK$ (no decimals) for KPI cards. */
export const fmtHKWhole = (n: number) =>
  `HK$ ${(Number.isFinite(n) ? n : 0).toLocaleString("en-HK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

/** Plain integer. */
export const fmtInt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-HK");

/** Date display: 03 May 2026. */
export const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d ?? "—";
  }
};

/**
 * Page header block — used across every Expenses page for a consistent
 * top-of-page pattern (title + description + right-aligned actions).
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-display font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export type KpiTone = "default" | "info" | "warning" | "destructive" | "success";

const TONE_VALUE: Record<KpiTone, string> = {
  default: "text-foreground",
  info: "text-primary",
  warning: "text-warning",
  destructive: "text-destructive",
  success: "text-primary",
};

/**
 * Uniform KPI card. Never truncates numbers with ellipsis — long values wrap
 * to fit the card, but the whole HK$ amount is always readable.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: KpiTone;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={
        "card-glass rounded-xl border border-border/60 p-4 " +
        (clickable
          ? "cursor-pointer transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
          : "")
      }
    >
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-1 font-semibold td-num tabular-nums whitespace-nowrap min-w-0 " +
          kpiValueSizeClass(value) + " " +
          TONE_VALUE[tone]
        }
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={typeof hint === "string" ? hint : undefined}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      {children}
    </div>
  );
}

export type StatusVariant = "muted" | "info" | "warning" | "destructive" | "success" | "neutral";

const STATUS_STYLES: Record<StatusVariant, string> = {
  muted: "bg-muted text-muted-foreground border border-border/60",
  neutral: "bg-secondary text-secondary-foreground border border-border/60",
  info: "bg-primary/10 text-primary border border-primary/25",
  warning: "bg-warning/10 text-warning border border-warning/30",
  destructive: "bg-destructive/10 text-destructive border border-destructive/30",
  success: "bg-primary/10 text-primary border border-primary/25",
};

/** Status pill using semantic tokens (no hardcoded amber/emerald/red). */
export function StatusPill({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: StatusVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        STATUS_STYLES[variant] +
        " " +
        className
      }
    >
      {children}
    </span>
  );
}

/** Map expense approval-status → status pill variant. */
export function approvalVariant(s: string | null | undefined): StatusVariant {
  switch (s) {
    case "posted":
      return "success";
    case "approved":
      return "info";
    case "pending_review":
      return "warning";
    case "rejected":
      return "destructive";
    case "void":
      return "muted";
    default:
      return "neutral";
  }
}

/** Map expense payment-status → status pill variant. */
export function paymentVariant(s: string | null | undefined): StatusVariant {
  switch (s) {
    case "paid":
      return "success";
    case "partial":
      return "info";
    case "unpaid":
      return "warning";
    default:
      return "neutral";
  }
}

/** Human labels for enum values. */
export const APPROVAL_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  posted: "Posted",
  void: "Void",
};
export const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
};

/** Table skeleton — use in place of "Loading…" text rows. */
export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} className="h-6" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** KPI grid skeleton. */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-glass rounded-xl border border-border/60 p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-28 mt-2" />
          <Skeleton className="h-3 w-16 mt-1" />
        </div>
      ))}
    </div>
  );
}

/** Empty state with optional CTA. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      {icon && <div className="text-muted-foreground mb-3">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="text-xs text-muted-foreground mt-1 max-w-md">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Scope line — small muted line showing counts / filters applied. */
export function ScopeLine({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted-foreground tabular-nums">{children}</div>;
}
