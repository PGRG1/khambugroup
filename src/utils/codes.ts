// Codes for new products and suppliers, the same for every client. A code is given once and never changes,
// even if the item later moves category; existing codes are left alone.
//   Product SKU   = the Level 1 category's fixed prefix (Bani's master list: Food FOD, Beverages BEV, …) + next number: FOD-0001
//   Supplier code = first 3 letters of the name + next number: DRI-001
import { supabase } from "@/integrations/supabase/client";

const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

/** The prefix for a Level 1 category: its code in Bani's master list, else the first 3 letters of its name. */
export function skuPrefix(level1: string, masterCode?: string | null): string {
  const code = letters(masterCode ?? "");
  if (code) return code.slice(0, 4);
  return (letters(level1).slice(0, 3) || "ITM").padEnd(3, "X");
}

/** Supplier code prefix: first 3 letters of the name, skipping a leading "The". */
export function supplierPrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(w => letters(w));
  const first = words.length > 1 && /^the$/i.test(words[0]) ? words.slice(1).join("") : words.join("");
  return (letters(first).slice(0, 3) || "SUP").padEnd(3, "X");
}

/** Next free code with this prefix: "FOD" + ["FOD-0001", "fod-0007"] → "FOD-0008". */
export function nextCode(prefix: string, taken: (string | null | undefined)[], digits: number): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  const used = taken.map(c => (c ?? "").trim().match(re)?.[1]).filter(Boolean).map(Number);
  return `${prefix}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(digits, "0")}`;
}

/** Next product SKU for a client, from the item's Level 1 category. */
export async function nextSku(tenantId: string, level1: string): Promise<string> {
  const db = supabase as any;
  const { data: l1s } = await db.rpc("client_level1_defaults", { p_tenant: tenantId });
  const code = ((l1s ?? []) as { name: string; code: string | null }[]).find(r => r.name.toLowerCase() === level1.toLowerCase())?.code;
  const prefix = skuPrefix(level1, code);
  const { data } = await db.from("product_master").select("internal_sku").eq("tenant_id", tenantId).ilike("internal_sku", `${prefix}-%`);
  return nextCode(prefix, ((data ?? []) as { internal_sku: string }[]).map(r => r.internal_sku), 4);
}

/** Next supplier code for a client, from the supplier's name. */
export async function nextSupplierCode(tenantId: string, name: string): Promise<string> {
  const prefix = supplierPrefix(name);
  const { data } = await (supabase as any).from("suppliers").select("code").eq("tenant_id", tenantId).ilike("code", `${prefix}-%`);
  return nextCode(prefix, ((data ?? []) as { code: string | null }[]).map(r => r.code), 3);
}
