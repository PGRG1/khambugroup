/**
 * Invoice review statuses and dispute "held" maths.
 *
 * Allowed invoices.review_status values: Draft, To approve, Approved,
 * Disputed, Voided. The legacy "Under Review" value stays readable but is
 * never written by new code.
 */

export const REVIEW_STATUSES = ["Draft", "To approve", "Approved", "Disputed", "Voided"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Scanner invoice_status → invoices.review_status. Only this mapping. */
export function mapScannerReviewStatus(scannerStatus: string | null | undefined): ReviewStatus {
  if (scannerStatus === "under_review") return "Draft";
  if (scannerStatus === "disputed") return "Disputed";
  return "Approved";
}

export interface HeldLineInput {
  quantity: number | null;
  unit_price: number | null;
  total?: number | null;
  accepted_qty?: number | null;
  accepted_price?: number | null;
}

/**
 * Held amount for a Disputed invoice: sum over lines of
 * max(0, invoiced amount − accepted amount), using accepted_qty /
 * accepted_price where present.
 */
export function computeHeldAmount(lines: HeldLineInput[]): number {
  const held = lines.reduce((sum, line) => {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unit_price) || 0;
    const invoiced = line.total != null ? Number(line.total) : qty * price;
    const accQty = line.accepted_qty != null ? Number(line.accepted_qty) : qty;
    const accPrice = line.accepted_price != null ? Number(line.accepted_price) : price;
    return sum + Math.max(0, invoiced - accQty * accPrice);
  }, 0);
  return Math.round(held * 100) / 100;
}

/** Outstanding payable: held dispute amounts are not payable. */
export function outstandingAfterHold(total: number, paid: number, held: number): number {
  return Math.round(Math.max(0, (Number(total) || 0) - (Number(paid) || 0) - (Number(held) || 0)) * 100) / 100;
}

// ============= Purchasing roles (per company) =============

export const PURCHASING_ROLES = ["staff", "manager", "owner"] as const;
export type PurchasingRole = (typeof PURCHASING_ROLES)[number];

/**
 * Backfill mapping for tenant_members.purchasing_role:
 * tenant_admin → owner; members with a global 'manager' role → manager;
 * other members → staff; platform_admin stays null.
 */
export function purchasingRoleForMember(
  memberRole: string,
  globalRoles: string[],
): PurchasingRole | null {
  if (memberRole === "platform_admin") return null;
  if (memberRole === "tenant_admin") return "owner";
  if (globalRoles.includes("manager")) return "manager";
  return "staff";
}
