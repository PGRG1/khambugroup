
## Goal

Replace the bank-recon-only learning loop with a **single, tenant-scoped, domain-agnostic** rules engine that every AI feature in the app reads from and writes to. Same UX everywhere: AI suggests → user picks **Accept Once** or **Accept & Teach**. A new **Admin → AI Rules** page lets authorised users review, edit, disable, delete, and audit everything the AI has learned.

The system is built multi-tenant from day one (single tenant today, ready for many tomorrow).

---

## 1. Data model (new tables)

### `tenants`
- `id`, `name`, `slug`, `created_at`
- Seeded with one row for KHAMBU; every existing user mapped to it.

### `tenant_members`
- `tenant_id`, `user_id`, `role` (`super_admin` | `tenant_admin` | `member`)
- Drives RLS isolation. `super_admin` (platform) can see across tenants; everyone else is scoped.

### `ai_learned_rules` (the unified store)
| Column | Purpose |
|---|---|
| `id` uuid pk | |
| `tenant_id` uuid not null | hard isolation |
| `venue_id` uuid null | optional venue scope |
| `domain` text | `finance` \| `bank_recon` \| `settlement` \| `procurement` \| `sales` \| `documents` \| `inventory` |
| `workflow` text | e.g. `bank_txn_classify`, `invoice_line_to_coa`, `settlement_to_deposit`, `receipt_field_extract`, `product_match` |
| `rule_type` text | finer bucket within workflow |
| `input_pattern` jsonb | structured trigger (regex, keywords, vendor, amount band, etc.) |
| `output_action` jsonb | structured result (account_id, category, product_id, mapping…) |
| `confidence` numeric | 0–1, AI-suggested or user-set |
| `hit_count` int default 0 | incremented on each apply |
| `last_used_at` timestamptz | |
| `source_examples` jsonb | array of `{record_type, record_id, snapshot}` evidence |
| `status` text | `active` \| `disabled` \| `needs_review` |
| `created_by`, `reviewed_by` uuid | |
| `created_at`, `updated_at` | |
| `version` int | bumped on each edit |

Indexes: `(tenant_id, domain, workflow, status)`, `(tenant_id, venue_id)`, GIN on `input_pattern`.

### `ai_learned_rules_history`
Append-only audit: snapshot of rule on every insert/update/delete with `changed_by`, `change_type`, `diff jsonb`, `changed_at`. Populated by trigger.

### `ai_rule_applications`
Each time a rule fires (auto or via Accept): `rule_id`, `tenant_id`, `domain`, `record_type`, `record_id`, `applied_by`, `was_overridden bool`, `created_at`. Powers hit_count, "needs review" flagging, and analytics.

### Migration of existing rules
`bank_recon_rules` rows are migrated into `ai_learned_rules` with `domain='bank_recon'`, `workflow='bank_txn_classify'`. The old table is kept as a read-only view for one release, then dropped.

### RLS
- All three new tables: RLS on, deny by default.
- `is_tenant_member(tenant_id)` and `is_super_admin()` security-definer helpers (mirrors existing `has_role` pattern).
- Policies:
  - SELECT: `is_tenant_member(tenant_id) OR is_super_admin()`
  - INSERT/UPDATE/DELETE on `ai_learned_rules`: tenant_admin of that tenant or super_admin.
  - History: SELECT only, same scope.

---

## 2. Shared classifier edge function

**`supabase/functions/ai-classify/index.ts`** — replaces `classify-bank-txn` and serves every domain.

Request:
```json
{ "domain": "bank_recon", "workflow": "bank_txn_classify",
  "tenant_id": "...", "venue_id": "...",
  "input": { ...domain-specific payload... },
  "context": { "max_examples": 25 } }
```

Behaviour:
1. Verify caller's JWT, resolve tenant membership.
2. Pull top-N active rules for `(tenant_id, domain, workflow)` ordered by `hit_count desc, last_used_at desc` as few-shot context.
3. Pull last 25 confirmed `ai_rule_applications` for the same workflow as additional examples.
4. Call Lovable AI Gateway (`google/gemini-3-flash-preview`) with a domain-aware system prompt assembled from a small per-workflow registry inside the function.
5. Return `{ suggestion, confidence, rule_pattern, output_action, rationale }` — never persists; the client decides Once vs Teach.

A second endpoint `POST /apply` records the decision: inserts into `ai_rule_applications`, optionally upserts a new rule (Accept & Teach), and increments `hit_count`/`last_used_at` if an existing rule matched.

---

## 3. Reusable client hook + UI

### `src/hooks/useAiSuggestion.ts`
```ts
useAiSuggestion({ domain, workflow, input })
  → { suggestion, isLoading, acceptOnce(), acceptAndTeach(), refetch }
```
Wraps the edge function, handles 429/402 toasts, caches per `input` hash.

### `<AiSuggestionPanel />` (new shared component)
- Renders the AI's proposed mapping with confidence chip.
- Two buttons: **Accept Once** / **Accept & Teach**.
- Shows "Why?" tooltip with rationale + 2 source examples.
- Used identically in every domain panel.

### Wire into existing screens
| Screen | Workflow |
|---|---|
| `TransactionReviewPanel.tsx` (bank recon) | `bank_txn_classify` — replace current inline UI |
| `SettlementBatchesTab.tsx` `AiMatchModal` | `settlement_to_deposit` — already exists, switch to shared hook |
| Invoice line editor (`InvoiceLinesTable` / `InvoiceEditor`) | `invoice_line_to_coa` — new panel per line that's missing an account |
| Receipt scanner result review (`ReceiptScannerModal`) | `receipt_field_extract` — supplier-specific field corrections become rules |
| Product matching dialog (procurement) | `product_match` — fuzzy descriptions → product_master mapping |

Each screen passes the right `input` JSON; nothing else changes about their existing flows.

---

## 4. Admin → AI Rules page

Route: `/admin/ai-rules` (gated by `tenant_admin` or `super_admin`).

Layout: `PageHeader` + filter bar + table + drawer.

**Filters**
- Tenant (super_admin only; hidden for tenant_admin)
- Venue
- Domain (multi-select chips)
- Workflow
- Rule type
- Status (Active / Disabled / Needs Review)
- Confidence range slider
- Hit count `>= N`
- Last used (date range)
- Free-text search on input/output JSON

**Table columns**
Domain · Workflow · Rule summary (humanised from `input_pattern` → `output_action`) · Confidence · Hits · Last used · Status · Actions.

**Row actions**
- Open drawer (full JSON, source examples, hit history chart).
- Toggle Active/Disabled.
- Mark "Needs Review".
- Edit (bumps `version`, writes history).
- Delete (soft via status='disabled' first; hard delete needs confirm).

**Approval queue tab**
Lists rules with `status='needs_review'` (auto-flagged when confidence < 0.7 OR hit_count > 10 with override rate > 20%). Admins approve → status='active'.

**Audit trail tab**
Reads `ai_learned_rules_history`, filterable by rule, user, date.

---

## 5. Permissions

Add page key `ai-rules` to `user_page_permissions` defaults; only granted to admin role. Add `usePagePermissions('ai-rules')` to gate the route and sidebar entry under **Admin**.

---

## 6. Rollout order (single PR per step is fine)

1. **Migration**: tenants, tenant_members (seed KHAMBU + map all users), `ai_learned_rules`, history, applications, RLS, helpers, history trigger, data-migrate `bank_recon_rules`.
2. **Edge function** `ai-classify` (with `/suggest` and `/apply`).
3. **Hook + shared component** `useAiSuggestion` + `AiSuggestionPanel`.
4. **Wire bank recon** to the new pipeline (delete old `classify-bank-txn`).
5. **Wire settlement matcher** to the new pipeline.
6. **Wire invoice line → COA**, **receipt scanner**, **product matching**.
7. **Admin → AI Rules** page (filters, drawer, edit, audit tab, approval queue).
8. **Memory update**: add `mem://features/ai-learning-engine` and reference it in the index.

---

## Notes / non-goals
- No tenant-onboarding UI yet — single tenant seeded; `super_admin` flag is just a column ready for the future.
- AI only ever **proposes** rules; nothing auto-activates without an explicit user action (matches your "Accept Once vs Accept & Teach" choice).
- All currency/date display still goes through `@/utils/format`; status pills via `<StatusBadge>`/chip classes; tables follow existing high-density spreadsheet style.
- Step 1 alone is a destructive schema change — I'll send the migration first and wait for approval before any code edits, per project rules.

Shall I proceed with **Step 1 (the migration)**?
