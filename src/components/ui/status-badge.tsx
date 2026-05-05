import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Unified status badge.
 * Color semantics (project-wide):
 *  - success (green)  : approved, posted, reconciled, paid
 *  - danger  (red)    : overdue, error, unmatched, cancelled, rejected
 *  - warning (amber)  : pending, needs_review, draft, partial
 *  - info    (blue)   : uploaded, extracted, verified, info
 *  - neutral (slate)  : default / unknown
 */

export type StatusTone = "success" | "danger" | "warning" | "info" | "neutral" | "secondary";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-success/15 text-success border-success/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  info: "bg-info/15 text-info border-info/30",
  neutral: "bg-muted text-muted-foreground border-border",
  secondary: "bg-accent/15 text-accent border-accent/30",
};

const STATUS_TONES: Record<string, StatusTone> = {
  // success
  approved: "success",
  posted: "success",
  reconciled: "success",
  paid: "success",
  active: "success",
  completed: "success",
  // danger
  overdue: "danger",
  error: "danger",
  unmatched: "danger",
  cancelled: "danger",
  rejected: "danger",
  failed: "danger",
  // warning
  pending: "warning",
  needs_review: "warning",
  "needs review": "warning",
  draft: "warning",
  partial: "warning",
  partially_paid: "warning",
  "partially paid": "warning",
  unpaid: "warning",
  on_leave: "warning",
  "on leave": "warning",
  // info
  uploaded: "info",
  extracted: "info",
  verified: "info",
  info: "info",
  scheduled: "info",
  // neutral / other
  resigned: "neutral",
  inactive: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  needs_review: "Needs Review",
  partially_paid: "Partially Paid",
  on_leave: "On Leave",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string;
  tone?: StatusTone;
  /** Smaller chip used inside dense tables. */
  size?: "sm" | "md";
}

export function StatusBadge({ status, tone, size = "sm", className, ...props }: StatusBadgeProps) {
  const key = (status ?? "").toString().toLowerCase().trim();
  const resolvedTone: StatusTone = tone ?? STATUS_TONES[key] ?? "neutral";
  const label = STATUS_LABELS[key] ?? (status ? status.charAt(0).toUpperCase() + status.slice(1) : "—");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium whitespace-nowrap capitalize",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        TONE_CLASSES[resolvedTone],
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "inline-block rounded-full",
          size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
          resolvedTone === "success" && "bg-success",
          resolvedTone === "danger" && "bg-destructive",
          resolvedTone === "warning" && "bg-warning",
          resolvedTone === "info" && "bg-info",
          resolvedTone === "neutral" && "bg-muted-foreground/60",
          resolvedTone === "secondary" && "bg-accent",
        )}
      />
      {label}
    </span>
  );
}
