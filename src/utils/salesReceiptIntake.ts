import { supabase } from "@/integrations/supabase/client";
import type { SalesRecord } from "@/types/sales";
import type { SalesSaveResult } from "./salesSaveResult";

export async function saveReceiptIntake(record: SalesRecord, file: File | null, scanId: string | null, tenantId: string): Promise<SalesSaveResult> {
  if (!file) return { status: "failed", error: "Original receipt is missing; nothing saved" };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const { data, error } = await supabase.functions.invoke("parse-receipt", { body: {
      op: "receipt_intake", tenantId, scanId, imageBase64: btoa(binary),
      mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"), fileName: file.name, tentative: record,
    } });
    if (error || data?.status !== "flagged" || typeof data.intakeId !== "string") return { status: "failed", error: data?.error || "Receipt could not be saved for review; retry safely" };
    return { status: "flagged", intakeId: data.intakeId, repeated: data.repeated === true };
  } catch { return { status: "failed", error: "Receipt could not be saved for review; retry safely" }; }
}