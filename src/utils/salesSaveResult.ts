export type SalesSaveResult =
  | { status: "saved"; recordId: string; journal: "completed" | "failed" | "draft" | "none" }
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
  // Clients read line by line have no accounting entry until payments are set up.
  if (result.journal === 'none') return 'Checked twice and recorded.';
  if(result.journal==='draft') return 'Sales recorded. Deferred revenue journal is waiting for approval.';
  return result.journal === "completed" ? "Checked twice and recorded. Journal updated."
    : "Sales recorded, but journal rebuild failed. Do not submit these sales again.";
}