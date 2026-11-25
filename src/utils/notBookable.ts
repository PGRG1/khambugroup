/** Why a linked item could not go into the books (same rules as the journal rebuild's purchase holds). */
export type NotBookable = { problem: "item" | "group" | "account" | "checking" | "unchecked"; category: string };

/** The short reason shown on the chat invoice card; Book stays off while any line has one. */
export function notBookableText(nb: NotBookable, venue: string): string {
  switch (nb.problem) {
    case "item": return "Not in your items";
    case "group": return "Item has no group";
    case "account": return `${nb.category || "Category"} has no account${venue ? ` at ${venue}` : ""}`;
    case "checking": return "Checking the books…";
    default: return "Couldn't check the books";
  }
}
