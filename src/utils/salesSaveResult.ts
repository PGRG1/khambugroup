export type SalesSaveResult =
  | { status: "saved"; recordId: string; journal: "completed" | "failed" }
  | { status: "flagged"; intakeId: string; repeated: boolean; reasons?: string[] }
  | { status: "failed"; error: string };

/** Only a confirmed insert permits financial success messaging. */
export function salesOutcomeMessage(result: SalesSaveResult): string {
  if (result.status === "failed") return result.error;
  if (result.status === "flagged") {
    const why = result.reasons?.length ? ` ${result.reasons.slice(0, 3).join("; ")}.` : "";
    return result.repeated ? `This receipt was already received — nothing added again.${why}`
      : `Kept for your review, not recorded.${why}`;
  }
  return result.journal === "completed" ? "Checked twice and recorded. Journal updated."
    : "Sales recorded, but journal rebuild failed. Do not submit these sales again.";
}