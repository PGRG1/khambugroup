# Why "Resolve 1 Blocking" won't clear — and how to fix it

## What is actually happening (verified in code)

The invoice does have one blocking issue. It is an **invoice-level (header) flag from the AI reviewer** — the long totals-reconciliation narrative visible in your Override dialog. It is real, it is counted, and it is the reason Save is disabled. It just has nowhere on screen to appear.

Three things combine to make it invisible:

1. **Blocking messages are only rendered where they match a field name.** Each flag is stored as `"<field>: <message>"` (`InvoiceScanner.tsx:720`). Header fields render a `CorrectionChip` that filters by field alias — supplier, venue, invoice number, date, total. A flag whose field isn't in that list is attached to no input and shown nowhere.
2. **The four check cards can't see it either.** Header Check only reacts to `invoice_number` / `invoice_date` / `due_date` prefixes and Supplier Check only to `supplier_name:` (`InvoiceReviewPanels.tsx:106-135`). **Math Check ignores review flags entirely** — it is driven solely by the arithmetic `totalMismatch` boolean (line 153). Your accepted subtotal equals the doc total, so Math Check reads "Passed" while a math-related blocking flag sits underneath it.
3. **The only place it is listed is behind a button.** The header-review dialog (lines 3002-3006) is the sole surface, reachable via "View review summary" in a grey one-line strip. The disabled Save button says "Resolve 1 blocking issue first" but doesn't say which or where.

There is also a dead end: `resolveField` (line 872) clears blocking messages **by field alias only**. A flag with an unrecognised field can never be resolved from the UI at all — Override is the only exit, and it demands a written reason. So the button labelled "Resolve 1 Blocking" is, for this class of flag, permanently unresolvable.

## The fix

### 1. Nothing blocking may be invisible — an always-visible blocking banner

Above the header fields, whenever the invoice has any blocking issue, show a red panel listing **every** blocking message (header and line), each with:

- where it came from — "Header" or "Line 4 — Mango"
- the message text
- an action: "Go to line" for line flags, "Dismiss" for header flags (below)

No expanding, no dialog, no "view summary" click. If Save is blocked, the reasons are on the page.

### 2. Header flags become dismissible

Add a per-message dismiss on header blocking flags that removes it from `review_blocking` regardless of field prefix, replacing the alias-only `resolveField` path for this case. Each dismissal records the message and who dismissed it so it still lands in the invoice notes on save — the audit trail Override currently provides, without forcing a written essay for a flag that only needs acknowledging.

This turns "Resolve 1 Blocking" into something you can genuinely resolve, and leaves Override for the case where you disagree with the substance.

### 3. Check cards stop lying

- **Math Check** picks up any blocking/warning flag on `total_amount`, `subtotal`, `line_totals` and the arithmetic mismatch — not just the latter.
- Any blocking flag whose field matches **no** card falls through to a fifth state on the banner rather than silently passing all four.
- Card status is derived from one shared classifier so a flag can never be counted by the save gate and ignored by every card.

### 4. Reduce false blocks at the source

`parse-invoice` currently escalates a line-sum vs invoice-total difference over $5 to blocking (line 579). In your case the reviewer reconciled the difference itself — it computed 2254.00, matched the printed doc total, and still emitted a blocking flag describing its own reasoning. Tighten the prompt so that when the reviewer's recomputed total agrees with the printed total, the finding is a **warning** describing the printed line-total discrepancy, not a block.

## Technical notes

| File | Change |
| --- | --- |
| `src/components/invoices/InvoiceScanner.tsx` | blocking banner above header fields; dismiss handler for header flags with notes/audit capture; wire "go to line" scroll+highlight |
| `src/components/invoices/InvoiceReviewPanels.tsx` | shared flag classifier; Math Check reads flags; unmatched-field fallthrough; new `BlockingBanner` component |
| `supabase/functions/parse-invoice/index.ts` | severity rule — reconciled total ⇒ warning, not blocking |

Nothing here changes extraction, matching, pricing or what gets saved to the invoice — only which findings are visible, how they are cleared, and the severity the reviewer assigns.

## Check cases

- An invoice with a header blocking flag on an unrecognised field → banner lists it, dismiss clears it, Save enables, note appended.
- A line blocking flag → banner lists it with "Go to line", still blocks Save until the line is fixed.
- Arithmetic mismatch with no flags → Math Check still shows "Total mismatch" as today.
- Reviewer recomputes a total that matches the printed total → warning, invoice saves without Override.
- Zero blocking issues → no banner, Save enabled, current behaviour unchanged.
