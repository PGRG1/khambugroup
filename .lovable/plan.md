
# Diagnosis — Ledger P&L rendering bug

## 1. What renders the P&L and what it reads

- **Page**: `src/pages/finance/LedgerPL.tsx`
- **Data hook**: `src/hooks/useLedgerPL.ts`
- **Data source**: direct queries against `journal_entries` + `journal_lines` (via `fetchAllRows`), plus `chart_of_accounts`. It does **not** read `v_trial_balance` or any view/RPC.
- Aggregation shape (line 101 of the hook):
  `Map<periodId, Map<accountId, Map<venue | "__total__", amount>>>`
  Every line contributes to both its `venue` bucket (or `"Unassigned"` when `venue IS NULL`) and to `"__total__"`.

## 2. `is_active` filtering

- `buildTree` in `LedgerPL.tsx` (line 52) filters accounts to `account_type === section && is_active`.
- The recently deactivated accounts (6100 empty Rent decoy, 1220–1280 empty card-brand merchant receivables) are asset accounts or an empty opex account. None held live P&L balances. Deactivating them **cannot** hide opex/cogs balances.
- New parent 1100 and children 1110/1120 are `asset` — never reach the P&L section builder (which filters by P&L account_type first).

## 3. Parent/child grouping

- `buildTree` groups children under parents **within the same account_type**. Accounts whose `parent_id` points outside the section are re-rooted (lines 87–94). `getAmount` (line 177) rolls children up into their parent by walking `accounts` and matching `parent_id`.
- No opex/cogs accounts have `parent_id` set, so the new AR parent/child structure does **not** affect P&L grouping. Not the cause.

## 4. Why opex/cogs disappear — the real bug

`LedgerPL.tsx` auto-selects the first organization on mount (lines 156–159):

```
if (!orgId && organizations.length > 0) setOrgId(organizations[0].id);
```

Once `orgId` is set, `venuesForColumns` becomes the exact set of `venues.name` rows belonging to that org (lines 162–170). Then `getAmount` and `sectionTotal` compute the consolidated total as:

```
sumVenues(acctMap, venuesForColumns)   // only sums keys that EXACTLY match a venue row
```

instead of `acctMap.get("__total__")`. **Any journal line whose `venue` string isn't an exact match for a venue row in the selected org is silently excluded.**

I confirmed against the database — for KHAMBU (venues: Arca, Assembly, Caliente, Hanabi), current posted lines include venue values that will be dropped:

| account_type | venue value | lines | net |
|---|---|---:|---:|
| opex | `NULL` (→ "Unassigned") | 65 | **2,363,914.92** |
| cogs | `ASSEMBLY` (uppercase) | 34 | 15,884.00 |
| cogs | `Caliante` (typo) | 15 | 819.40 |
| cogs | `Caliente and Hanabi` | 29 | 27,255.00 |
| cogs | `CALIENTE AND HANABI` | 1 | 2,592.00 |
| cogs | `CALIENTE KITCHEN` | 1 | 700.00 |
| revenue | `NULL` (ARCA, → "Unassigned") | 6 | **-420,000.00** |

That's why:
- **Opex looks empty / heavily reduced**: 2.36M of opex is tagged with `venue = NULL` (bill postings without a venue split), so it disappears the moment KHAMBU is auto-selected.
- **ARCA revenue doesn't appear**: all 6 new manual JE lines were posted with `venue = NULL` (correct for group-level revenue), so `venuesForColumns` never picks them up.
- **Small cogs discrepancies vs trial balance**: uppercase / typo / multi-venue tags are dropped too (~47K).

Trial balance sums every line regardless of venue, so it stays correct — this is a display-layer filter bug, not data loss.

## 5. Why the recent DB changes made it visible now

The bug has existed since the org filter was introduced. It was hidden because most historical opex/revenue happened to be tagged with venues that match the KHAMBU venue names verbatim. The new ARCA manual accruals (correctly posted with `venue = NULL` for a group-level revenue share) were the first postings that made a whole account vanish from the screen, prompting the review — which then also surfaced the pre-existing 2.36M of null-venue opex.

## Proposed fix (do not apply until approved)

Scope: `src/pages/finance/LedgerPL.tsx` only. No DB change, no touching journal data, no touching `useLedgerPL`.

Change the org-scoped consolidated sum from **"only include venues in this org"** to **"exclude venues that belong to a different org"**. Concretely:

1. Derive `otherOrgVenueNames = Set<string>` of venue names owned by any org other than the selected one (from `useVenues`).
2. Replace the `sumVenues(acctMap, venuesForColumns)` branch inside `getAmount` and `sectionTotal` with:
   ```
   let total = acctMap.get("__total__") || 0;
   for (const [k, v] of acctMap) {
     if (k === "__total__") continue;
     if (otherOrgVenueNames.has(k)) total -= v;
   }
   ```
   Effect: NULL venues ("Unassigned"), typos, uppercase variants, and multi-venue labels stay in the current org's total. Only lines that can be positively attributed to a different org are excluded.
3. Per-venue drilldown (`perVenue = true`) is unchanged — it still lists each org venue column plus a "Total" column that now also uses the corrected consolidated math.
4. CSV/PDF exports are unaffected because they both go through the same `getAmount` / `sectionTotal`.

Follow-up (separate, not part of this fix):
- The stray venue tags (`ASSEMBLY`, `Caliante`, `Caliente and Hanabi`, `CALIENTE KITCHEN`) are real data hygiene issues in `journal_lines.venue`. They should be normalized in a later data-cleanup migration so the per-venue view is accurate, but they don't need to block this display fix.

Waiting for approval before touching any code.
