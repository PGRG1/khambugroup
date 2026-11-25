/** What to tell the person after "save as rule": live, waiting for an approver, or refused as too broad. */
export type TeachResult = { rule_status?: "active" | "needs_review" | null; rule_refused?: string | null } | null | undefined;

export function teachMessage(teach: boolean, data: TeachResult): { title: string; description?: string } {
  if (!teach) return { title: "Classification applied" };
  if (data?.rule_refused) return { title: "Applied, but not saved as a rule", description: `${data.rule_refused}. Ask an admin to add a narrower rule in Settings › Bani.` };
  if (data?.rule_status === "needs_review") return { title: "Applied. Rule sent for approval", description: "An admin or someone with Approve on Finance needs to approve it in Settings › Bani before Bani uses it." };
  return { title: "Applied and saved as a rule", description: "Bani will suggest this for matching lines. You can switch it off in Settings › Bani." };
}
