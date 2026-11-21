import { supabase } from "@/integrations/supabase/client";

export type CashSlipRead = { receipt_date: string | null; amount: number; description: string; suggested_classification_id: string | null; confidence?: "high" | "medium" | "low" };
type Upload = { url: string | null; path: string | null };

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = reject;
  r.readAsDataURL(file);
});

/** Same storage as Petty Cash › Import: the user's folder in petty-cash-receipts. Non-fatal. */
export async function uploadCashSlip(file: File): Promise<Upload> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return { url: null, path: null };
  try {
    const path = `${uid}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("petty-cash-receipts").upload(path, file, { contentType: file.type, upsert: false });
    if (error) return { url: null, path: null };
    const { data } = await supabase.storage.from("petty-cash-receipts").createSignedUrl(path, 60 * 60 * 24 * 365);
    return { url: data?.signedUrl ?? null, path };
  } catch {
    return { url: null, path: null };
  }
}

/** One cash-box slip through parse-petty-cash-receipt (same reader as Petty Cash › Import). Nothing is saved. */
export async function readCashSlip(file: File, classifications: { id: string; name: string }[]): Promise<{ rows: CashSlipRead[]; upload: Upload }> {
  const [upload, base64] = await Promise.all([uploadCashSlip(file), fileToBase64(file)]);
  const { data, error } = await supabase.functions.invoke("parse-petty-cash-receipt", {
    body: { files: [{ base64, mimeType: file.type || "application/octet-stream", filename: file.name }], classifications },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || "Extraction failed");
  return { rows: Array.isArray(data.rows) ? data.rows : [], upload };
}

export type CashSlipRow = { float_id: string; receipt_date: string; amount: number; description: string; classification_id: string };

export function cashSlipProblem(r: CashSlipRow): string | null {
  if (!r.description.trim()) return "Description required";
  if (!r.classification_id) return "Classification required";
  if (!r.float_id) return "Float required";
  if (!(r.amount > 0)) return "Amount must be > 0";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.receipt_date)) return "Date required";
  return null;
}

/** A cash-box receipt, pending a manager's approval (never booked here). Shared by Petty Cash › Import and Bani chat. */
export async function insertPendingCashSlip(tenantId: string, row: CashSlipRow, upload: Upload) {
  const problem = cashSlipProblem(row);
  if (problem) throw new Error(problem);
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await supabase.from("petty_cash_receipts").insert({
    tenant_id: tenantId, float_id: row.float_id, receipt_date: row.receipt_date, amount: row.amount,
    description: row.description.trim(), classification_id: row.classification_id,
    receipt_url: upload.url, receipt_path: upload.path, status: "pending", created_by: uid,
  } as any);
  if (error) throw error;
}
