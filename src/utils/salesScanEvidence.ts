import type { SalesRecord } from "@/types/sales";

// Ephemeral metadata, deliberately excluded from SalesRecord and financial payloads.
const scans = new WeakMap<SalesRecord, string>();
export function associateSalesScan(record: SalesRecord, scanId: string | null) {
  if (scanId) scans.set(record, scanId);
}
export async function captureSavedSalesScan(
  record: SalesRecord, salesRecordId: string, tenantId: string,
  invoke: (body: { op: string; scanId: string; salesRecordId: string; tenantId: string }) => Promise<unknown>,
) {
  const scanId = scans.get(record);
  if (!scanId) return;
  try { await invoke({ op: "capture_evidence", scanId, salesRecordId, tenantId }); }
  catch { /* Evidence capture must never change the result of a financial save. */ }
}