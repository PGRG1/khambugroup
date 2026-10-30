export type SalesSaveResult =
  | { status: "saved"; recordId: string; journal: "completed" | "failed" }
  | { status: "flagged"; intakeId: string; repeated: boolean }
  | { status: "failed"; error: string };

/** Only a confirmed insert permits financial success messaging. */
export function salesOutcomeMessage(result: SalesSaveResult): string {
  if (result.status === "failed") return result.error;
  if (result.status === "flagged") return result.repeated
    ? "This file is already flagged for review. No additional sales recorded."
    : "Receipt saved for review — source verification is incomplete. No sales recorded.";
  return result.journal === "completed" ? "Sales recorded. Journal rebuild completed."
    : "Sales recorded, but journal rebuild failed. Do not submit these sales again.";
}