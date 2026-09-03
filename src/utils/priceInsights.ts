import { PRICE_VARIANCE_EPSILON } from "@/utils/priceVariance";

export interface SupplierInsightEntry {
  id: string;
  productMasterId: string;
  supplierName: string;
  purchaseUnit: string;
  purchasePrice: number;
  stockUom: string;
  stockQty: number;
}

export interface SupplierPurchase {
  supplierName: string;
  price: number;
  date: string;
  invoiceNumber?: string;
  isFree?: boolean;
  quantity?: number;
}

export interface SupplierInsightRow {
  entryId: string;
  supplierName: string;
  purchasePrice: number;
  purchaseUnit: string;
  normalizedCost: number | null;
  stockUom: string;
  percentDifference: number | null;
  latestPurchaseDate: string | null;
  source: "Latest invoice" | "Master price";
  stale: boolean;
  comparable: boolean;
  unavailableReason?: string;
}

export interface SupplierInsightsResult {
  currentNormalizedCost: number | null;
  rows: SupplierInsightRow[];
  cheaperCount: number;
}

export interface BuildSupplierInsightsInput {
  entries: SupplierInsightEntry[];
  purchases: SupplierPurchase[];
  currentSupplierName: string;
  currentPurchasePrice: number;
  currentStockQty: number;
  currentPurchaseUnit: string;
  canonicalStockUom: string;
  asOf?: string;
}

export const normalizeSupplierName = (value: string | null | undefined) =>
  (value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

export const isComparableSupplierEntry = (
  entry: Pick<SupplierInsightEntry, "stockUom" | "stockQty">,
  canonicalStockUom: string,
) =>
  finitePositive(Number(entry.stockQty)) &&
  !!canonicalStockUom.trim() &&
  normalizeSupplierName(entry.stockUom) === normalizeSupplierName(canonicalStockUom);

export const normalizedSupplierCost = (purchasePrice: number, purchaseToStockQty: number) =>
  finitePositive(purchasePrice) && finitePositive(purchaseToStockQty)
    ? purchasePrice / purchaseToStockQty
    : null;

const daysBetween = (from: string, to: string) => {
  const fromMs = Date.parse(`${from}T00:00:00`);
  const toMs = Date.parse(`${to}T00:00:00`);
  return Number.isFinite(fromMs) && Number.isFinite(toMs) ? (toMs - fromMs) / 86400000 : null;
};

export function buildSupplierInsights(input: BuildSupplierInsightsInput): SupplierInsightsResult {
  const currentSupplierKey = normalizeSupplierName(input.currentSupplierName);
  const currentEntry = input.entries.find((entry) => normalizeSupplierName(entry.supplierName) === currentSupplierKey);
  const currentNormalizedCost = currentEntry && isComparableSupplierEntry(currentEntry, input.canonicalStockUom)
    ? normalizedSupplierCost(input.currentPurchasePrice, input.currentStockQty)
    : null;
  const asOf = input.asOf || new Date().toISOString().slice(0, 10);

  const rows = input.entries
    .filter((entry) => normalizeSupplierName(entry.supplierName) !== currentSupplierKey)
    .map((entry): SupplierInsightRow => {
      const purchase = input.purchases
        .filter((candidate) =>
          normalizeSupplierName(candidate.supplierName) === normalizeSupplierName(entry.supplierName) &&
          !candidate.isFree &&
          finitePositive(Number(candidate.price)) &&
          Number(candidate.quantity ?? 0) > 0,
        )
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const rawPrice = purchase?.price ?? Number(entry.purchasePrice);
      const comparable = isComparableSupplierEntry(entry, input.canonicalStockUom) && finitePositive(rawPrice);
      const normalizedCost = comparable ? normalizedSupplierCost(rawPrice, Number(entry.stockQty)) : null;
      const percentDifference = currentNormalizedCost && normalizedCost != null
        ? ((normalizedCost - currentNormalizedCost) / currentNormalizedCost) * 100
        : null;
      const latestPurchaseDate = purchase?.date || null;
      const age = latestPurchaseDate ? daysBetween(latestPurchaseDate, asOf) : null;
      return {
        entryId: entry.id,
        supplierName: entry.supplierName,
        purchasePrice: rawPrice,
        purchaseUnit: entry.purchaseUnit,
        normalizedCost,
        stockUom: input.canonicalStockUom || entry.stockUom,
        percentDifference,
        latestPurchaseDate,
        source: purchase ? "Latest invoice" : "Master price",
        stale: age != null && age > 90,
        comparable,
        unavailableReason: comparable ? undefined : "Not comparable — conversion missing",
      };
    })
    .sort((a, b) => {
      if (a.normalizedCost == null && b.normalizedCost == null) return a.supplierName.localeCompare(b.supplierName);
      if (a.normalizedCost == null) return 1;
      if (b.normalizedCost == null) return -1;
      return a.normalizedCost - b.normalizedCost;
    });

  const cheaperCount = currentNormalizedCost == null
    ? 0
    : rows.filter((row) => row.normalizedCost != null && currentNormalizedCost - row.normalizedCost > PRICE_VARIANCE_EPSILON).length;

  return { currentNormalizedCost, rows, cheaperCount };
}
