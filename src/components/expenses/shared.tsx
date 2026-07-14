import { ReactNode, useCallback, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { kpiValueSizeClass } from "@/utils/kpiSize";
import { Check } from "lucide-react";
export { kpiValueSizeClass };

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

/* ============================================================
 * PageHeader — canonical top-of-page block. Subtle bottom rule
 * pulls the section into a single editorial system.
 * ============================================================ */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="pb-5 border-b border-border/50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5 font-medium">
              {eyebrow}
            </div>
          )}
          <h1 className="text-[26px] leading-none font-display font-semibold tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * KpiCard — never truncates numbers. Left accent bar carries the
 * tone; the value dominates typography, the label sits above it in
 * a small caps eyebrow.
 * ============================================================ */
export type KpiTone = "default" | "info" | "warning" | "destructive" | "success";

const TONE_VALUE: Record<KpiTone, string> = {
  default: "text-foreground",
  info: "text-primary",
  warning: "text-warning",
  destructive: "text-destructive",
  success: "text-primary",
};

const TONE_BAR: Record<KpiTone, string> = {
  default: "bg-border/70",
  info: "bg-primary/60",
  warning: "bg-warning/70",
  destructive: "bg-destructive/70",
  success: "bg-primary/60",
};

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
        "card-glass relative rounded-xl border border-border/60 pl-4 pr-4 py-4 min-w-0 " +
        "overflow-hidden " +
        (clickable
          ? "cursor-pointer transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
          : "")
      }
    >
      <span
        aria-hidden
        className={"absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full " + TONE_BAR[tone]}
      />
      <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
        {label}
      </div>
      <div
        className={
          "mt-1.5 font-display font-semibold td-num tabular-nums whitespace-nowrap min-w-0 leading-none " +
          kpiValueSizeClass(value) + " " +
          TONE_VALUE[tone]
        }
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {hint && (
        <div
          className="text-[11px] text-muted-foreground mt-2 leading-tight break-words"
          title={typeof hint === "string" ? hint : undefined}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * KpiGrid — responsive with a saner cap. Never packs more than 5 cards
 * per row so long HK$ amounts always breathe.
 */
export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {children}
    </div>
  );
}

/* ============================================================
 * StatusPill — semantic-token pill with a leading dot indicator
 * (per the project's chip system) so state reads at a glance.
 * ============================================================ */
export type StatusVariant = "muted" | "info" | "warning" | "destructive" | "success" | "neutral";

const STATUS_STYLES: Record<StatusVariant, string> = {
  muted: "bg-muted text-muted-foreground border border-border/60",
  neutral: "bg-secondary text-secondary-foreground border border-border/60",
  info: "bg-primary/10 text-primary border border-primary/25",
  warning: "bg-warning/10 text-warning border border-warning/30",
  destructive: "bg-destructive/10 text-destructive border border-destructive/30",
  success: "bg-primary/10 text-primary border border-primary/25",
};

const STATUS_DOT: Record<StatusVariant, string> = {
  muted: "bg-muted-foreground/50",
  neutral: "bg-muted-foreground/60",
  info: "bg-primary",
  warning: "bg-warning",
  destructive: "bg-destructive",
  success: "bg-primary",
};

export function StatusPill({
  variant = "neutral",
  children,
  className = "",
  dot = true,
}: {
  variant?: StatusVariant;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-none " +
        STATUS_STYLES[variant] +
        " " +
        className
      }
    >
      {dot && (
        <span
          aria-hidden
          className={"h-1.5 w-1.5 rounded-full shrink-0 " + STATUS_DOT[variant]}
        />
      )}
      <span className="truncate">{children}</span>
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
    case "reversed":
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
  reversed: "Reversed",
  void: "Void",
};
export const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
};

/* ============================================================
 * StatusFlow — compact horizontal pipeline used inside the bill
 * editor. Each step lights up when the current status has reached
 * it; the active step gets a filled dot.
 * ============================================================ */
export function StatusFlow({
  steps,
  currentIndex,
  terminal,
}: {
  steps: string[];
  currentIndex: number;
  /** Optional label overriding the pipeline when the record is in a terminal state (e.g. Reversed / Void). */
  terminal?: { label: string; variant: StatusVariant };
}) {
  if (terminal) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 flex items-center gap-2">
        <StatusPill variant={terminal.variant}>{terminal.label}</StatusPill>
        <span className="text-[11px] text-muted-foreground">
          This bill is in a terminal state — no further workflow actions.
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {steps.map((label, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={label} className="flex items-center gap-1.5 shrink-0">
              <div
                className={
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none border transition-colors " +
                  (active
                    ? "bg-primary/15 text-primary border-primary/40"
                    : done
                    ? "bg-primary/5 text-primary/80 border-primary/20"
                    : "bg-transparent text-muted-foreground border-border/60")
                }
              >
                {done ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " +
                      (active ? "bg-primary" : "bg-muted-foreground/40")
                    }
                  />
                )}
                {label}
              </div>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={
                    "h-px w-4 " + (i < currentIndex ? "bg-primary/40" : "bg-border")
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 * FormSection — group inputs inside sheet editors so users see
 * hierarchy instead of a wall of fields.
 * ============================================================ */
export function FormSection({
  title,
  description,
  children,
  aside,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card/40 p-4">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-xs uppercase tracking-[0.14em] font-semibold text-foreground/90">
            {title}
          </h3>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-1 max-w-lg leading-snug">
              {description}
            </p>
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

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

/** KPI grid skeleton — matches the KpiGrid breakpoints. */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
    <div className="flex flex-col items-center justify-center text-center py-14 px-4">
      {icon && (
        <div className="mb-3 rounded-full border border-border/60 bg-muted/40 p-3 text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <div className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">
          {description}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Scope line — small muted line showing counts / filters applied. */
export function ScopeLine({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted-foreground tabular-nums">{children}</div>;
}

/* ============================================================
 * ConfirmDialog + useConfirm — one styled AlertDialog for the
 * whole section, replacing every window.confirm() /confirm() call.
 * ============================================================ */
type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
  resolve?: (v: boolean) => void;
};

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ open: false, title: "" });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resolverRef.current?.(false);
      resolverRef.current = null;
      setState((s) => ({ ...s, open: false }));
    }
  };

  const handleConfirm = () => {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false }));
  };

  const dialog = (
    <AlertDialog open={state.open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          {state.description && (
            <AlertDialogDescription className="whitespace-pre-line leading-relaxed">
              {state.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{state.cancelLabel || "Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={
              state.tone === "destructive"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }
          >
            {state.confirmLabel || "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
