## Investigation: `/finance/chart-of-accounts` page

### Every action on the page

**Header (top-right)**
1. **"Rebuild Ledger"** button (outline style, `RefreshCw` icon) — the scary one. Details below.

**Toolbar (Accounts tab)**
2. Search box — read-only filter, no data change.
3. Type filter dropdown — read-only filter.
4. Active / Inactive / All toggle — read-only filter.
5. **"Add Account"** — opens editor sheet to create a new CoA row. No confirmation; safe (just inserts one row you fill in).

**Per-row actions (each of the 71 accounts)**
6. **Pencil (Edit)** — opens editor sheet to change code/name/type/parent/flags/description of that one account. No confirmation dialog before opening; save is an explicit click.
7. **Trash (Delete)** — opens a confirmation dialog that first counts posted journal lines and child accounts. If the account has history, the dialog offers a "Deactivate instead" path; DB-level `guard_*` triggers block hard-delete of anything referenced by journal lines. Safe.

**Account Mappings tab** — 4 sub-tabs (Sales Revenue, Payment Methods, Procurement, Payroll). Each is a matrix that lets you pick which GL account a given source (venue, payment method, supplier, payroll component) posts to. Changes take effect on the *next* ledger rebuild; they don't rewrite existing posted entries.

---

### The "Rebuild Ledger" button — what it actually does

Wired to `rebuildFromOperations()` → calls the DB function `rebuild_journal_from_operations(tenant_id)`.

Confirmation copy currently shown:

> "Regenerates all auto-derived journal entries for this tenant. Manually-edited entries are preserved."

What it actually does in the database, in order:

1. Writes an audit-log row `ledger_rebuild_start`.
2. For journal entries in this tenant where `source_type IN ('sales_summary', 'invoice', 'invoice_payment', 'settlement_clearing', 'bank_txn', 'payroll_accrual', 'payroll_payment')` **AND `status = 'draft'` AND `manually_adjusted = false`**:
   - Unlinks them from settlement batches.
   - Deletes the journal_lines.
   - Deletes the journal_entries.
3. Re-derives all of those entries fresh from the underlying operational tables (sales_records, invoices, invoice_payments, settlement batches, bank_transactions, payroll) using the current Account Mappings.
4. Returns a count and shows a toast: `Ledger rebuilt — N entries`.

**Critical safety facts:**
- **Posted entries are NOT touched.** The `WHERE status = 'draft'` clause is the safety net — anything already posted to the books is immune.
- **Manually-adjusted draft entries are NOT touched** (`manually_adjusted = false` filter).
- **No source data is deleted** — sales, invoices, bank transactions, payroll all remain untouched. Only the derived double-entry rows are rebuilt.
- Requires the caller to have the `admin` role on this tenant; regular users get "Not authorized".
- Wrapped in a single transaction (function body), so a mid-rebuild failure rolls back.
- Full audit trail written to `ledger_audit_log`.

**What could go wrong from casual clicking:**
- If mappings are misconfigured (e.g. a payment method points to the wrong account), a rebuild will re-post draft entries using those wrong mappings — visible immediately in Trial Balance / P&L, but reversible by fixing the mapping and rebuilding again.
- Any draft entries a user was mid-way editing but hadn't marked `manually_adjusted` would be wiped and recreated. Low likelihood in normal use.
- No irreversible destruction of KHAMBU's real books. Posted entries, source records, and manually-adjusted drafts are all safe.

---

### Plain-language summary for a non-technical user

**What this page is:** the master list of "buckets" (accounts) money flows in and out of — cash, sales, supplier bills, payroll, etc. — plus a mapping tab that says "sales at Assembly go to this bucket, Visa payments go to that bucket." 71 accounts today.

**Safe to click around?** Yes for browsing, filtering, editing an account name/code, and configuring mappings. The Delete button on a row is guarded — you can't accidentally remove an account that has real transactions in it.

**The scary button — "Rebuild Ledger":** It does NOT delete your sales, bills, or bank data. It only re-runs the automatic double-entry bookkeeping for entries that are still in *draft* status and haven't been hand-edited. Anything already posted to the closed books is untouched. The worst realistic outcome is that if the account mappings are wrong, the rebuilt draft entries land in the wrong accounts — fixable by correcting the mapping and rebuilding again. There is a confirmation dialog before it runs, and only admins can trigger it.

**Bottom line:** No risk to KHAMBU's real live financial data from casual clicking on this page. The current confirmation wording ("auto-derived journal entries… manually-edited entries preserved") is technically accurate but uses jargon most operators won't parse — the concrete safety facts (posted books untouched, source data untouched, reversible by re-running) are not spelled out.

---

### If you want to act on this later (not doing now)

Options to reduce alarm without changing behaviour:
- Rewrite the confirmation dialog in plain language listing what IS and ISN'T affected.
- Move "Rebuild Ledger" off the Chart of Accounts page (it's an operations action, not an account-config action) — better home is the Journal page (where it already also exists) or an Admin/Ledger tools page.
- Add an inline info tooltip next to the button on the CoA header explaining it's safe.

Awaiting your call on whether/which of these to do.
