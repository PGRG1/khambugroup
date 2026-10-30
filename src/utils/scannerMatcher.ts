import { z } from "zod";

export const matcherDraftSchema = z.object({ name: z.string(), category: z.string().nullable(), purchase_unit: z.string().nullable(), stock_unit: z.string().nullable(), units_per_purchase_unit: z.number().positive().nullable(), unit_price: z.number().nonnegative().nullable(), supplier_code: z.string().nullable() });
export type MatcherDraft = z.infer<typeof matcherDraftSchema>;
export const matcherResponseSchema = z.object({ lines: z.array(z.object({ line_index: z.number().int().nonnegative(), decision: z.enum(["sure", "probably", "cant_tell", "new", "not_a_product"]), product_master_id: z.string().nullable(), alternatives: z.array(z.string()).max(3), reason: z.string(), draft: matcherDraftSchema.nullish() })), options: z.array(z.object({ id: z.string(), name: z.string(), last_paid: z.number().nullable(), times_bought: z.number() })).default([]) });
export type MatcherAnswer = z.infer<typeof matcherResponseSchema>["lines"][number];
export type MatcherOption = z.infer<typeof matcherResponseSchema>["options"][number];
export const needsMatcherReview = (answer?: MatcherAnswer | null) => !!answer && ["probably", "cant_tell", "new"].includes(answer.decision);
export const matcherSnapshot = (line: object) => {
  const value = line as Record<string, unknown>;
  const fields = ["description", "item_code", "quantity", "unit_price", "unit", "total", "printed_amount", "pack_size", "product_master_id", "supplier_entry_id", "matcher_confirmed", "matcher_edit_revision"];
  return JSON.stringify(fields.map(key => value[key] ?? null));
};
export const matcherCanApply = (before: string, line: object, originalSupplier: string, supplier: string, saved?: boolean) => !saved && originalSupplier === supplier && before === matcherSnapshot(line);
export function matcherToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value || "").join("-");
}