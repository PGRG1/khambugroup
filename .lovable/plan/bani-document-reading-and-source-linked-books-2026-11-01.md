# Bani document reading and source-linked books

## Result
An upload becomes a checked, saved and posted record when evidence is sufficient. Otherwise Bani asks one specific question, keeps the original file and continues when answered. The full review stays available through **⋯ Check every field**, never the default.

## 1. Contextual reading and independent checking
- Use the requested **google/gemini-3-flash-preview** for Z-report and invoice extraction/review. Its workspace availability and image input are confirmed; a live document read still needs verification. Preserve the separate independent verifier unless changing its contract is necessary.
- Supply server-derived HKT today/upload time, permitted venues, missing trading days including recurring closures, last report numbers, scoped layouts/correction evidence, and recent supplier invoice dates/numbers.
- Retain raw printed date, printed weekday, original extraction and per-field confidence/evidence. A blind second read checks the original document without seeing the first proposed answer.
- Enforce future-date, 60-day, weekday, sequence, known-party, totals and duplicate checks. Clearly printed historical dates are not silently changed to 2026. Correct ambiguous years only with corroborating evidence and retain the correction reason.
- Check tenders including delivery against sales, and subtotal + service charge + signed discount against sales. Invoice checks preserve existing discounts, tax, rounding, deposits and negative returns.
- Same amount is a duplicate warning, not proof. Combine tenant/date/venue, report or invoice number, document hash and financial fingerprint; recheck atomically before saving.

## 2. Save/post or ask one question
- Reuse receipt intake, invoice attachment/matching/save logic and guarded Bani accounting posting; do not create new accounting calculations.
- Commit source, lines, journal, verification result and audit together. Show source/date/amount **posted · Undo** in chat and the page only after confirmed persistence.
- Ask the highest-priority unresolved question in main/floating Bani and Finance Needs you. Apply its answer to the retained draft and rerun all checks; keep other blockers internally and never treat a human answer as independent verification.
- Keep scanner hosting, attachments, manual review and existing permissions. Supplier invoices still require real delivery-count evidence, with a simple explicit unchanged-count confirmation when appropriate. Missing accounts, quantities or required approval become questions, not invented values.
- Payroll/pay stays human; no outgoing bank transfer automation or weakened claim approval.

## 3. Stable identities and immutable corrections
- Add tenant-scoped stable accounting-source UUIDs, source fingerprints/revisions and explicit reversal/supersession links, preserving legacy source keys and original journals.
- Invoices, bills, claims, payments and payouts link to persistent record UUIDs. **Sales keep existing daily aggregate posting math**: each summary receives a stable UUID and membership links to sales-record UUIDs; date/venue become attributes, not identity. A receipt edit reconciles both affected old/new daily groups.
- Backfill links using tenant, venue, date, amounts and full line/tender fingerprints. Associate the two named orphan summaries with their matching 2026 sources only when evidence agrees; ambiguous matches remain unresolved.
- Extend the existing unique live-source index rather than assuming none exists. Enforce one effective canonical posting per source/role while keeping superseded originals and compensating entries. Payment, payout and fee roles must remain distinct.
- Route all source financial edits/deletions through an atomic, access-checked correction transaction, including header, line and account edit paths. Lock sources/groups, compare expected revisions, reverse old posting, update the source and post replacements through existing math.
- If the original period is open, reverse on its original date. If closed, leave it locked and compensate in the current open month. If the current month is closed, stop for an owner decision, never silently reopen. Allow cancelling an existing future-dated error through a narrowly paired correction, not arbitrary future business postings.
- Undo removes the active source from ordinary lists and reverses its financial effect atomically, retaining its UUID, archived evidence, documents and original journals. Refuse unsafe Undo after dependent payments/deliveries, subsequent edits or other locked dependencies.
- Audit actor, exact before/after values, source/book links and **books updated**. Cleanup uses **Fixed by Bani · leftover from an edit**, with guarded Undo.

## 4. Learning and uploads that survive AI outages
- Extend tenant-scoped existing learning/evidence stores to include dates and show them in Settings › Bani. Original documents remain authoritative; conflicting examples require resolution; pay is excluded.
- Privately store original uploads before extraction, with a durable deduplicated job/draft so reloads, navigation and AI errors cannot lose files.
- Reuse bounded accounting queue processing, database leases, idempotent progress and pause guards at every entry point.
- Show the actual safe error in chat and the page. Use **“Bani can't read new documents right now: the workspace AI limit was reached”** only when that is the actual cause.
- Confirmed workspace-credit/limit pauses allow at most one probe item per later scheduled run; normal processing resumes only after success. Provider denials/refusals are terminal: no probes, rephrasing, credential changes or substitute models. The existing pause only records “Forbidden”; classify its actual reason before enabling recovery.

## 5. Authorized cleanup and drift checks
- Capture full source/journal drift and affected-period balances before financial writes. Replace the Books broad suspicious-dates list with evidence-linked drift and unresolved Needs you items.
- Apply the two named duplicate reversals and five invoice repairs only through the new correction mechanism, with source fingerprints, original evidence, audit and Undo. Do not create another copy of either correct 2026 sales posting.
- Current read-only checks confirm **2 named orphan sales postings**, **5 invoice date mismatches**, **744 posted legacy sales summaries**, and **0 closed months**. The 744 summaries need identity assessment, not automatic classification as errors. Full multi-source drift remains to be measured.
- Current invoice dates: PBC36987 **29 Apr 2026**; BA260803767 **19 Aug 2026**; 1569682 **22 Jul 2026**; C000HKG11504946 **17 Jul 2026**; C000HKG11533210 **27 Aug 2026**. BA260803767 differs in day as well as year; check its original document, never infer 26 Aug from its number.
- Run drift now and after each source change. Fix only deterministic, authorized differences; put ambiguous evidence in Needs you. Separate original document date from the accounting adjustment date so closed-period compensation is not repeatedly flagged as drift.

## Reconciliation choice
The requested repairs and **“2026 P&L unchanged” cannot both hold** for the current postings. These five invoices contain **HK$23,780.20 of costs** and **HK$1,050.00 of deposits** outside 2026. Moving their existing lines into their current 2026 dates should reduce 2026 profit by **HK$23,780.20**. The two orphan-sales reversals should leave 2026 revenue unchanged and net their erroneous 2006/2024 revenue to zero. Preserve correct accounting and report the exact delta; do not invent offsets to force an unchanged P&L.

## Verification and completion report
- Add tests using the real 2006/2024/2028 cases: evidenced year handling, clearly printed historical dates, future/60-day/weekday boundaries, missing versus zero, signed totals, party resolution, sequences and duplicate fingerprints.
- Add transaction tests for save + post + readback + Undo; rollback on failed posting; repeated/concurrent commits; one live source/role constraint; open/closed-month edits; old/new sales-group moves; header/line/account changes and unsafe Undo refusal.
- Signed-in desktop/375px checks: retained real upload, question/answer completion, posted outcome with source/journal readback, optional full review, hosted scanner, learning and AI-paused retention. Use isolated reversible fixtures for destructive tests, not payroll or real payments.
- Check automatic build diagnostics and focused tests. Report full drift before/after, each of the seven cleanup outcomes, 2006/2024 net revenue and exact 2026 P&L delta; clearly list evidence-ambiguous or AI-blocked checks.

## Technical approach and current status
- Additive database changes through the migration tool, explicit grants/RLS and existing tenant/action rights; service-only queue/evidence stay inaccessible to clients.
- Update existing Classic server functions/shared rules before scanner/Bani/page consumers. Record structural changes in applicable AGENTS.md rules.
- **No app code or financial data has changed during planning.**
