export type PurchasingMode = "by_venue" | "central";

export function resolvePurchasingMode(value: unknown): PurchasingMode {
  return value === "central" ? "central" : "by_venue";
}

/** Overview only: central buying ignores the picker, never tenant/data permissions. */
export function purchasingOverviewRows<T extends { venue: string | null }>(
  rows: T[], mode: PurchasingMode, includesVenue: (venue: string | null) => boolean,
): T[] {
  return mode === "central" ? rows : rows.filter(row => includesVenue(row.venue));
}