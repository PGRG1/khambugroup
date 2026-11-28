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
export const paidByLabel = (kind: string | null | undefined, name: string | null | undefined) =>
  kind ? `${name ?? ""}${name ? " · " : ""}${PAID_BY_KINDS.find(k => k.value === kind)?.label.toLowerCase() ?? kind}` : "";
