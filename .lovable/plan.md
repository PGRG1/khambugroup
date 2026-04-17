

## Fix: Allow free editing of External SKU & External Name

### Root cause
In `src/components/invoices/ProductAutocomplete.tsx` (lines 167-176), `handleBlur` calls `resolveExactMatch` on whatever the user typed and silently fires `onSelect(...)` whenever the value happens to exactly equal an existing product. Because `onSelect` in the parent overwrites BOTH fields (SKU + Name) and triggers PM hydration, the user's edit gets reverted the moment focus leaves the cell. This is why backspacing and typing a new value "doesn't stick" — it gets snapped back on blur.

### Fix
Remove the auto-`onSelect`-on-blur behavior. Selection should only happen via:
- explicit click on a dropdown suggestion
- pressing `Enter` on a highlighted suggestion

Free-text values the user types (whether they happen to match a product or not) must be preserved as-is. The parent component already handles auto-matching elsewhere (via `resolveProductMatch` in `productMasterResolver.ts` during scan/save), so no functionality is lost.

### Change (single file: `src/components/invoices/ProductAutocomplete.tsx`)

Replace `handleBlur` (lines 167-176) with a no-op that only resets the `justSelectedRef` flag and closes the dropdown. Drop the `resolveExactMatch` call entirely from blur. Keep `resolveExactMatch` definition only if used elsewhere — it isn't — so remove it too for cleanliness.

### Impact
- External SKU and External Name become fully editable: backspace, retype, paste, clear all work as expected.
- Dropdown still appears as you type; clicking a suggestion or pressing Enter still hydrates both fields via `onSelect`.
- No DB or other-file changes; affects scanner edit, Procurement edit, and Invoices edit dialogs uniformly.

