# Floating Bani: first usable slice

## What will work
- An official Bani launcher on tenant pages, excluding the full Bani page, sign-in and platform administration. Desktop uses a restrained right panel; phones use a bottom panel without leaving the page.
- General questions reuse Bani’s existing read-only intelligence. A quiet chip identifies the current module and known venue.
- Inside Scan Invoice, the same assistant is hosted within the scanner’s modal. A per-line Ask Bani control selects the target explicitly.
- Bani can explain the live unsaved review and propose a bounded line correction or a match to an existing item for the selected supplier. Each proposal shows before/after and requires Apply; completion says “Applied to review — not saved.”
- Existing Save, blockers, attachments and goods-receipt creation remain untouched. Other writes and Teach/Remember are unsupported.

## Safety and technical details
- Scope ephemeral conversations to authenticated user, tenant, route and draft. Abort replies and clear record context when that scope changes.
- Stable draft/line identities plus a full draft fingerprint invalidate proposals after any edit, reorder, switch, save or closure. Apply uses a functional state update and rejects stale or repeated proposals.
- Validate bounded context and whitelisted structured proposals server-side. Verify supplier/item ownership against tenant-scoped master records, and recheck the current host data and edit permissions before applying.
- Reuse the existing budget model and authenticated chat machinery; no provider migration, model-side writes or shared master changes. Scanned content remains untrusted data.
- Use existing match, discount, receiving and review helpers, preserving scanned evidence and documented refund handling. Ambiguous pack/conversion requests require clarification.

## Verification
- Focused tests for whitelist/value validation, ownership, stale/duplicate actions, totals and match evidence.
- Desktop and phone checks inside the actual scanner modal using a non-persisted draft, including one real model proposal and local Apply. No financial writes or broad paid scan.
- Report actual checks, limitations, changed files and available usage evidence. Do not publish.