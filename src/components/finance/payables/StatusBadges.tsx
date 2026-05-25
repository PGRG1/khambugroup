import { cn } from "@/lib/utils";

export type PaymentStatus =
  | "unpaid"
  | "scheduled"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "credit_note_applied"
  | "voided";

export type BankMatchStatus =
  | "not_ready"
  | "awaiting_bank_match"
  | "matched"
  | "possible_match"
  | "needs_review";

const PAYMENT_META: Record<PaymentStatus, { label: string; cls: string; dot: string }> = {
  unpaid: { label: "Unpaid", cls: "bg-zinc-500/10 text-zinc-300 border-zinc-500/30", dot: "bg-zinc-400" },
  scheduled: { label: "Scheduled", cls: "bg-sky-500/10 text-sky-300 border-sky-500/30", dot: "bg-sky-400" },
  partially_paid: { label: "Partially Paid", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30", dot: "bg-amber-400" },
  paid: { label: "Paid", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" },
  overdue: { label: "Overdue", cls: "bg-red-500/15 text-red-300 border-red-500/40", dot: "bg-red-400" },
  credit_note_applied: { label: "Credit Note", cls: "bg-purple-500/10 text-purple-300 border-purple-500/30", dot: "bg-purple-400" },
  voided: { label: "Voided", cls: "bg-zinc-700/30 text-zinc-400 border-zinc-600/40 line-through", dot: "bg-zinc-500" },
};

const MATCH_META: Record<BankMatchStatus, { label: string; cls: string; dot: string }> = {
  not_ready: { label: "Not Ready", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30", dot: "bg-zinc-500" },
  awaiting_bank_match: { label: "Awaiting Match", cls: "bg-sky-500/10 text-sky-300 border-sky-500/30", dot: "bg-sky-400" },
  matched: { label: "Matched", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" },
  possible_match: { label: "Possible Match", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30", dot: "bg-amber-400" },
  needs_review: { label: "Needs Review", cls: "bg-red-500/10 text-red-300 border-red-500/30", dot: "bg-red-400" },
};

function Badge({ cls, dot, label, title }: { cls: string; dot: string; label: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
        cls
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus | string }) {
  const meta = PAYMENT_META[status as PaymentStatus] ?? PAYMENT_META.unpaid;
  return <Badge cls={meta.cls} dot={meta.dot} label={meta.label} title={status} />;
}

export function BankMatchBadge({ status }: { status: BankMatchStatus | string }) {
  const meta = MATCH_META[status as BankMatchStatus] ?? MATCH_META.not_ready;
  return <Badge cls={meta.cls} dot={meta.dot} label={meta.label} title={status} />;
}

export const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = [
  "unpaid",
  "scheduled",
  "partially_paid",
  "paid",
  "overdue",
  "credit_note_applied",
  "voided",
];

export const BANK_MATCH_OPTIONS: BankMatchStatus[] = [
  "not_ready",
  "awaiting_bank_match",
  "matched",
  "possible_match",
  "needs_review",
];

export function paymentStatusLabel(s: string) {
  return PAYMENT_META[s as PaymentStatus]?.label ?? s;
}
export function bankMatchLabel(s: string) {
  return MATCH_META[s as BankMatchStatus]?.label ?? s;
}
