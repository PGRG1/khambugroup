
Goal: make the invoice matching use the Product Master exact row for External SKU `141189135M15`, so the External Name becomes `Chilled Cube Roll A' Aust 3.1K/Up Teys Classic` every time.

What I found
- I confirmed the Product Master has an exact row for `141189135M15` and its supplier product name is `Chilled Cube Roll A' Aust 3.1K/Up Teys Classic`.
- The problem is not the data. It is the edit-flow logic.
- In `src/components/procurement/ProcurementInvoicesTab.tsx`, typing into `item_code` only changes the raw field. It does not rematch the row immediately, so an old matched name/product can stay stuck.
- That stale state is made worse because `product_master_id` is kept on the line, and the helper later prefers that old ID over the newly typed SKU.
- In `src/components/invoices/ProductAutocomplete.tsx`, the blur auto-match uses the captured `query` prop instead of the current input value, so exact matches can be missed when the user types and tabs away quickly.

Implementation plan
1. Fix manual exact matching in the Procurement Edit page
- Update `src/components/procurement/ProcurementInvoicesTab.tsx`
- When `item_code` changes:
  - clear stale matched state from the old product
  - do an exact Product Master lookup by External SKU first
  - if found, immediately overwrite both:
    - External SKU
    - External Name
  - also update `product_master_id`, internal SKU, UOM fields, and price flags from that exact row
- If no exact SKU match is found, keep the typed value but clear the old matched product info so the wrong name does not remain.

2. Apply the same exact sync when typing External Name
- In the same procurement edit file, when `description` changes:
  - run an exact lookup on supplier product name/internal product name
  - if found, backfill both External Name and External SKU from that exact Product Master row
- This keeps manual typing behavior consistent with dropdown selection.

3. Harden autocomplete blur matching
- Update `src/components/invoices/ProductAutocomplete.tsx`
- Change the blur logic to use `e.currentTarget.value` instead of the stale rendered `query`
- Keep it exact-match only on blur
- Prefer supplier-scoped exact match first, then fall back to a global exact match if needed

4. Stop stale product IDs from overriding new exact codes
- In `ProcurementInvoicesTab.tsx`, ensure a changed SKU/name does not keep the old `product_master_id` unless the new exact match resolves to that same row
- This prevents the old product name from “winning” after the user types a new exact code

5. Mirror the same fix in the legacy edit page if needed
- Apply the same exact-on-manual-entry logic to `src/pages/Invoices.tsx`
- That page uses the same autocomplete pattern and can fail in the same way

Technical details
- Exact SKU match must take priority over any fuzzy/contains logic
- Dropdown suggestions can remain fuzzy for search convenience, but actual auto-assignment on manual entry should be exact
- No backend/schema changes are needed; this is frontend matching-state cleanup

Expected result
- Typing `141189135M15` and tabbing out will set the External Name to `Chilled Cube Roll A' Aust 3.1K/Up Teys Classic`
- Picking a row from either External SKU or External Name dropdown will always synchronize both fields
- Old wrong names will no longer stay stuck after a new exact SKU is entered
