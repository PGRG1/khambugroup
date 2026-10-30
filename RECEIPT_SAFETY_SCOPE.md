# Receipt safety: implemented and deferred

## Implemented
- Scanner saves the original file, server extraction (when available), tentative figures, source hash and reasons into non-posting receipt intake, never sales_records or journals.
- Repeated file hashes are tenant-idempotent, backed by a unique constraint and atomic advisory lock. Existing same-venue dates/nonblank report numbers are linked for comparison rather than overwritten.
- Missing/unclear extracted fields remain null in server evidence. Tentative editor values can still show zeros; the review displays original extraction alongside tentative values and labels both unverified.
- Intake requires authenticated admin/manager, resolved tenant and venue access; private source reads follow the visible scoped intake. Client cannot execute the registration RPC or modify intake rows.
- Parent onSave returns explicit outcomes. Failed upload/insert cannot claim saved. Committed manual sales with journal rebuild failure warn against resubmission; the manual form clears only after committed success.
- Bani retains up to 24 recent turns / 48,000 characters, including attachment names and action outcomes; prompts avoid introductions and claims of cards or writes without confirmed work.
- Substantive main-chat analysis routes to supported google/gemini-3-flash-preview; short turns retain google/gemini-3.1-flash-lite. A minimal live gateway call to the stronger model returned ready. Other model calls remain unchanged.
- Functions parse-receipt and chat-assistant deployed. Migration 0015 is additive; no financial backfills, inserts, updates or live sales tests performed. Existing bulk-upsert conflict target remains unchanged, protected from tenant reassignment by a trigger.

## Trust states
- Raw extraction: model output, unverified.
- Intake: needs_review, non-posting, source-linked by hash; not trusted correction memory.
- Step-1 saved audit examples: human_saved_unverified; unchanged independently verified retrieval requirements.

## Deferred / not implemented
- Independent field-by-field source verifier, clear date/session/period identification and verified-new-record autonomous posting. Every scanner receipt now stays flagged; this is a safety fallback, not completion of the requested autonomous worker.
- Resolution/posting actions, durable failed-intake recovery, source comparison investigation by Bani, and complete journal posting verification.
- Tenant-aware replacement for existing sales uniqueness and bulk upsert: old uniqueness remains to avoid breaking imports. It still may block different tenants with identical date/venue/report keys. Intake itself uses tenant-aware uniqueness and never double-counts revenue.
- Bounded history retains recent context only, not durable long-conversation summaries.
- Provider-denial state persistence and a broader gateway-client migration are not included.

## Checks
- 50 focused tests passed using isolated Node configuration (default jsdom runner blocked by unavailable canvas binding): outcome honesty, evidence filtering, tenant/source rejection, upload/registration failure, repeated intake and conversation routing/context.
- Latest application check: build OK.
- Signed-in KHAMBU route entry was exercised, but rendering repeatedly transitioned through loading/detached elements; complete desktop/375px scanner and comparison flow is not verified. No live intake was submitted, to avoid writing artificial restaurant evidence.

## Main changed files
- src/components/dashboard/ReceiptScanner.tsx, ManualInput.tsx
- src/pages/DataPage.tsx, src/hooks/useSalesData.ts
- src/components/sales/ReceiptIntakes.tsx
- src/utils/salesSaveResult.ts, salesReceiptIntake.ts
- supabase/functions/parse-receipt/index.ts, intake.ts
- supabase/functions/_shared/receiptIntakePolicy.ts, baniConversation.ts, assistantPrompt.ts
- supabase/functions/chat-assistant/index.ts, salesReview.ts
- src/components/assistant/FloatingBani.tsx
- drizzle/migrations/0015_sales_receipt_nonposting_intake.sql
- src/test/baniReceiptSafety.test.ts, receiptIntakeServer.test.ts