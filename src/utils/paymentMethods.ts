/**
 * Shared payment-method helpers for supplier / AP payment recording and display.
 *
 * payments.payment_method is free-text (no DB check constraint), so the
 * "TBC / Unassigned" choice is stored as the stable value "tbc".
 */

export const PAYMENT_METHOD_TBC = "tbc";
export const UNASSIGNED_ACCOUNT = "__unassigned__";

export interface PaymentMethodOption {
  value: string;
  label: string;
  bankLinked: boolean;
}

/** Methods offered in the Record Payment dialog. Order matters for the UI. */
export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { value: "Bank Transfer", label: "Bank Transfer", bankLinked: true },
  { value: "FPS", label: "FPS", bankLinked: true },
  { value: "Cheque", label: "Cheque", bankLinked: true },
  { value: "Cash", label: "Cash", bankLinked: false },
  { value: "Credit Card", label: "Credit Card", bankLinked: false },
  { value: "Other", label: "Other", bankLinked: false },
  { value: PAYMENT_METHOD_TBC, label: "TBC / Unassigned", bankLinked: false },
];

const BANK_LINKED = new Set(
  PAYMENT_METHOD_OPTIONS.filter((o) => o.bankLinked).map((o) => o.value.toLowerCase())
);

/** True only for methods that genuinely settle from a bank account. */
export function isBankLinkedMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  return BANK_LINKED.has(method.trim().toLowerCase());
}

/** Human label for a stored payment_method value (handles legacy/free text). */
export function paymentMethodLabel(method: string | null | undefined): string {
  const m = (method || "").trim();
  if (!m) return "TBC / Unassigned";
  if (m.toLowerCase() === PAYMENT_METHOD_TBC) return "TBC / Unassigned";
  const known = PAYMENT_METHOD_OPTIONS.find((o) => o.value.toLowerCase() === m.toLowerCase());
  return known ? known.label : m;
}

/** Human label for a paid-from bank account; never shows stale bank digits. */
export function paidFromAccountLabel(accountName: string | null | undefined): string {
  const n = (accountName || "").trim();
  return n || "Unassigned";
}

/** Reference-number placeholder — always optional. */
export function referencePlaceholder(method: string | null | undefined): string {
  const m = (method || "").trim().toLowerCase();
  if (m === "fps") return "FPS ref (optional)";
  if (m === "bank transfer") return "Bank txn id (optional)";
  if (m === "cheque") return "Cheque ref (optional)";
  return "Optional";
}

/**
 * Resolve the account id to persist, given the selected method and selection.
 * Non-bank methods and the explicit "unassigned" choice always persist NULL.
 */
export function resolvePaidFromAccountId(
  method: string | null | undefined,
  selectedId: string | null | undefined
): string | null {
  if (!isBankLinkedMethod(method)) return null;
  if (!selectedId || selectedId === UNASSIGNED_ACCOUNT) return null;
  return selectedId;
}
