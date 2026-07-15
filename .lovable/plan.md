## Staff Reimbursements — three follow-ups

### 1. Promote to its own top-level sidebar group

- `src/components/AppSidebar.tsx`:
  - Remove Staff Reimbursements from `financeItems`.
  - Add a new group key `staffreimbursements` to `GroupKey` and `loadGroupState` defaults.
  - Add a new `CollapsibleNavGroup` (icon: `HandCoins` from lucide) with the same pattern as Petty Cash. Structure the group so more pages can slot in later, but ship only:
    - **Overview** → `/staff-reimbursements` (moves the current page from `/finance/staff-reimbursements`).
    - Sub-section stubs (`Operations`, `Master Data`) are NOT rendered until pages exist — keep the shape ready in code comments rather than empty labeled sections.
  - Gate visibility with `canSeeSection("staff_reimbursements")` (mirrors `pettycash` gate). Platform admins / tenant admins always see it; regular users get it when their permission map allows.
- `src/App.tsx`: update the route to `/staff-reimbursements` (single canonical path). Drop the old `/finance/staff-reimbursements`.
- No page-content changes required for this move.

### 2. KPI strip — expense breakdown by financial_type

Rework the KPI row on `src/pages/finance/StaffReimbursements.tsx`:

- Keep **Total Owing** and **Paid This Month** cards.
- Add three tone-differentiated KPI cards for the **current month** (owing + paid combined, based on `claim_date` in the current month):
  - **COGS** — sum of amounts whose classification.financial_type = `cogs`
  - **Opex** — sum where `opex`
  - **Assets** — sum where `asset`
- Cards use `KpiCard` with distinct tones (`warning`, `info`, `success`) so the breakdown reads instantly.
- Add a compact `hint` under each showing the # of claims.
- Verify the table's **Category** column is prominent: bump it from muted text to a neutral chip (small pill using `StatusPill variant="neutral"`) alongside the financial-type badge (`COGS/Opex/Asset` in muted mono). Keep column order.

Also: when the page is rendered, memoize a `claimTypeById` map so category ID → financial_type is a single O(1) lookup shared by KPI totals and the table row rendering.

### 3. AI Import flow

**Edge function `supabase/functions/parse-staff-reimbursement/index.ts`** (new)

Follows the `parse-bill` pattern:
- CORS + `requireAuth`.
- Accepts `{ files: [{ base64, mimeType, filename }], categories: [{ id, name, financial_type }] }`.
- Branches on mimeType per file:
  - **Images (`image/*`)**: pass as `image_url` data URL to Gemini.
  - **PDFs (`application/pdf`)**: pass as `file` block data URL.
  - **Excel (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheetml`, `application/vnd.ms-excel`)**: parse in Deno via `npm:xlsx` → convert every sheet's rows to CSV text and inline that as a `text` block prefixed with the sheet name.
  - **Word (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)**: parse via `npm:mammoth` → extract raw text → inline as a `text` block.
  - Unknown types → skip with a warning field in the response.
- Uses `google/gemini-2.5-flash` with `response_format: json_object`.
- **System prompt** instructs the model to:
  - Extract multiple claims when multiple receipts/rows are present.
  - Translate any non-English text to English.
  - For each claim return: `claimant_name` (string, "" if not identifiable), `description` (short English), `amount` (number), `claim_date` (YYYY-MM-DD, else ""), `suggested_category_id` (must be one of the IDs from the categories list passed in, choose the closest match by name/type), `confidence` ("high"|"medium"|"low"), `source_hint` (e.g. "Excel row 4" or "Page 2 receipt").
  - Never invent amounts.
- Returns `{ success: true, claims: [...] }`. Errors surface `429` / `402` cleanly like parse-bill.

**Client component `src/components/staff-reimbursements/ReimbursementAiImport.tsx`** (new)

Two-step dialog (single `Dialog`, internal step state):
- **Step 1 — Upload**: mirrors `BillScanner` UI (drag/drop, choose files, camera, previews, remove per file). Accepts `image/*,application/pdf,.xlsx,.xls,.docx`. Max 15 MB per file. On submit: base64 each file, POST to `parse-staff-reimbursement` with the categories list, plus (optionally) upload the first file to the existing `petty-cash-receipts` storage bucket under `staff-reimbursements/<uid>/…` so extracted claims can carry an attachment.
- **Step 2 — Review**: table of editable rows. Columns: claimant (Input), description (Input), category (Select — pre-selected to `suggested_category_id`, falls back to first classification if unset), amount (numeric Input), date (date Input), source hint (muted text), row-level delete (X), row-level status (chip: pending / saving / saved / error). Bulk **Save All** button + per-row **Save**. Rows validate before save (claimant, description, category, amount>0, date). On save each row calls `sr.createClaim(...)` with the shared `receipt_url`/`receipt_path` (from the uploaded original), so journal-posting logic is untouched. Saved rows stay visible but disabled with a green tick; errors show inline. When all rows are saved, "Done" closes the dialog and triggers `sr.reload()`.

**Page wiring `src/pages/finance/StaffReimbursements.tsx`**:
- Add "AI Import" button (icon `Sparkles`) next to the existing "+ Add Claim" action in the `PageHeader`.
- Keep the current manual `AddClaimDialog` intact.
- Render `<ReimbursementAiImport .../>` alongside it.

### Technical notes

- **npm packages in edge function**: `xlsx` and `mammoth` both work through Deno's `npm:` specifiers (no deno.json changes needed). Mammoth needs `extractRawText({ buffer })` — provide a `Buffer` via `Buffer.from(base64, 'base64')` from `node:buffer`.
- **Multi-page PDFs**: Gemini reads them directly, no split needed.
- **Categories payload size**: current tenant has < 20 classifications, well under any token limit.
- **Attachment storage**: reuse the existing `petty-cash-receipts` bucket, path `staff-reimbursements/<uid>/…` (matches the existing manual dialog upload — no new bucket).
- **No changes** to `useStaffReimbursements` hook API — the AI import path calls the same `createClaim`.
- **No new DB migration** — everything reuses existing tables and columns.

### Verification
- `tsgo` typecheck.
- Manual smoke: upload a receipt image → review row appears → edit → Save → new claim + accrual JE in ledger. Upload a small `.xlsx` with 3 rows → 3 review rows → save all.
