export type PaidByKind = "staff" | "director" | "group_company" | "other";
/** Who can pay a supplier for the business, and where what is owed to them sits in the books. */
export const PAID_BY_KINDS: { value: PaidByKind; label: string; owedIn: string }[] = [
  { value: "staff", label: "Staff member", owedIn: "Other payables" },
  { value: "director", label: "Director", owedIn: "Director's loan" },
  { value: "group_company", label: "Group company", owedIn: "Due to related companies" },
  { value: "other", label: "Other person", owedIn: "Other payables" },
];
export const PAID_BY_METHOD = "Paid by someone else";
export const paidByValid = (p: { name: string } | null | undefined) => !!p && p.name.trim().length > 0 && p.name.trim().length <= 120;
/** Who paid, by name only (like an ERP contact). The type only decides the account; see paidByKindLabel. */
export const paidByLabel = (kind: string | null | undefined, name: string | null | undefined) =>
  kind ? (name?.trim() || "someone else") : "";
/** Only where it is owed (the account), shown on hover, e.g. "Other payables". Never a label like "staff member". */
export const paidByKindLabel = (kind: string | null | undefined) => PAID_BY_KINDS.find(x => x.value === kind)?.owedIn ?? "";
