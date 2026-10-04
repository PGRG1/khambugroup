# Scan Invoice review typography audit

## 1. Supplier field and indentation

**Rendered component:** `src/components/invoices/InvoiceScanner.tsx:2451-2498`

- Label: `<Label className="text-xs">Supplier</Label>` at lines 2452-2453, inside `flex h-5 items-center gap-1.5`.
- Control: Radix/shadcn `<Select>` with `<SelectTrigger className={cn("h-8 w-full min-w-0 text-xs", ...)}>` and `<SelectValue className="truncate" />` at lines 2462-2468.
- Shared trigger base: `src/components/ui/select.tsx:17-29` adds `flex h-10 ... px-3 py-2 text-sm ... [&>span]:line-clamp-1`.
- Supplier option rows use `pl-8 pr-2` for the checkmark gutter (`src/components/ui/select.tsx:101-120`), and “Add new supplier” deliberately uses the same `pl-8` (`InvoiceScanner.tsx:2473-2485`). Those paddings apply only to the open menu, not the closed field value.
- Supplier labels are trimmed before rendering (`InvoiceScanner.tsx:378-379`), so stored leading whitespace is removed.

**Finding:** there is no supplier-only left indent in the closed control. Its effective horizontal padding is `px-3`, exactly like Venue and Status, and exactly like the shared Input base. `SelectValue` adds truncation only—no padding, icon slot, wrapper offset, or `text-indent`. If Supplier looks farther right, the source does not support an actual extra inset; it is an optical/content difference between Radix-selected text and native input text. The open dropdown is intentionally indented by its `pl-8` indicator gutter, but that does not affect the trigger.

## 2. Header-field typography and controls

Shared primitives:

- `Label` adds `text-sm font-medium leading-none`; each scanner label overrides size with `text-xs` (`src/components/ui/label.tsx:7-13`).
- `Input` adds `h-10 w-full px-3 py-2 text-base md:text-sm`, sans/inherited colour and normal weight (`src/components/ui/input.tsx:5-16`). Scanner classes override height and intended size.
- `SelectTrigger` adds `h-10 px-3 py-2 text-sm`, sans/inherited colour and normal weight (`src/components/ui/select.tsx:13-29`).

| Field | Label element/classes | Value/control/classes | Deviation |
|---|---|---|---|
| Supplier | `Label text-xs`, inside `flex h-5 items-center gap-1.5` (`InvoiceScanner.tsx:2451-2461`) | `SelectTrigger h-8 w-full min-w-0 text-xs` + shared `px-3 py-2`; `SelectValue truncate` (`2462-2468`) | No unique inset. Error helper is `text-xs`, larger than most table helpers (`2488-2490`). |
| Venue | Same `Label text-xs` and `h-5` wrapper (`2500-2510`) | `SelectTrigger h-8 w-full min-w-0 text-xs`, shared `px-3 py-2` (`2511-2518`) | Matches Supplier structurally. |
| Invoice # | Same `Label text-xs` and `h-5` wrapper (`2520-2530`) | `Input h-8 w-full min-w-0 text-xs`, shared `px-3 py-2` (`2531`) | Identifier is sans, while invoice identifiers elsewhere are mono. |
| Status | Same `Label text-xs` and `h-5` wrapper (`2533-2536`) | `SelectTrigger h-8 w-full min-w-0 text-xs`, shared `px-3 py-2` (`2537-2547`) | Matches Supplier/Venue; conditional helper switches to `text-[11px]` (`2548-2556`). |
| Invoice Date | Bare `Label text-xs`, no fixed-height wrapper (`2559-2561`) | `Input h-8 text-xs`, shared `w-full px-3 py-2` (`2561`) | Label baseline/vertical spacing differs from first-row labels; date is sans rather than mono. Correction chip defaults to `mt-1`, unlike first-row inline chips. |
| Due Date | Bare `Label text-xs`, no fixed-height wrapper (`2569-2571`) | `Input h-8 text-xs`, shared `w-full px-3 py-2` (`2571`) | Same deviations as Invoice Date. |
| Notes | Bare `Label text-xs` (`2579`) | `Textarea min-h-8 resize-none py-1.5 text-xs`, horizontal padding inherited from Textarea (`2579-2581`) | Different height model and vertical padding; no fixed label wrapper. |

All header labels are medium-weight, sentence/title case, no tracking class, and inherit foreground colour. The inconsistent parts are vertical wrapper use, chip placement, helper sizing, and mono treatment—not Supplier padding.

## 3. Line-items table audit

**Headers:** table establishes `text-xs` (`InvoiceScanner.tsx:2641`); every named `<th>` uses `px-1 py-1 text-muted-foreground font-medium`, mostly `text-left`, with amount columns right-aligned (`2645-2667`). They are Title Case except `Acc. price`, and are not uppercase or tracked.

| Columns/cells | Current classes | Flagged deviations |
|---|---|---|
| Row number | `px-1 py-1 ... font-medium`, inherited `text-xs` (`2764-2770`) | Sans number; different vertical padding from cells. |
| Internal SKU | read-only `Input text-xs ... font-mono h-7` (`2773-2780`) | Correct mono identifier, but Input keeps shared `px-3 py-2`. |
| Internal Name | read-only `div text-xs min-h-7 px-2 py-1` (`2783-2787`) | Uses `px-2`, unlike Input `px-3`; variable height. Warning helper is `text-[10px]` (`2789-2792`). |
| External SKU | `ProductAutocomplete ... text-xs h-7` (`2795-2807`) | SKU is sans, unlike Internal SKU. Shared Input gives `px-3`. |
| External Name | multiline ProductAutocomplete caller `text-xs` (`2813-2830`); component base `px-3 py-1.5 text-sm` (`ProductAutocomplete.tsx:160-175`) | Mixed `text-sm`/`text-xs` declarations; variable height. Helpers mix `text-[10px]` and `text-[11px]` (`InvoiceScanner.tsx:2832-2927`). |
| Purchase UOM / Stock UOM | read-only `Input text-xs ... h-7` (`2933-2941`, `2953-2962`) | Sans abbreviations; shared `px-3`. |
| Purchase Qty | editable `Input text-xs h-7` (`2943-2951`) | Numeric value is sans and not right-aligned. |
| Stock Qty | read-only `Input text-xs ... h-7 font-mono` (`2964-2972`) | Mono, but not explicitly right-aligned. |
| Accepted Qty | editable `Input text-xs h-7 ... font-mono` (`2974-2983`) | Mono, but not explicitly right-aligned. |
| Difference | read-only `div text-xs h-7 px-2 ... justify-end font-mono tabular-nums` (`2985-2997`) | Correct numeric alignment, but differs from neighbouring Input padding. |
| Reason | read-only `div text-xs h-7 px-2` or native `select text-xs h-7 px-2` (`2999-3019`) | Uses native select typography rather than shared Select; `px-2` rather than `px-3`. |
| Note | `Input text-xs h-7` (`3023-3031`) | Sans; shared `px-3`. |
| Purchase Cost | numeric `Input text-xs h-7` (`3040-3049`) | Numeric value is sans and not right-aligned; helpers use `text-[9px]` and `text-[10px]` (`3051-3068`). |
| Accepted price | numeric `Input text-xs h-7` (`3073-3109`) | Numeric value is sans and not right-aligned; helper text mixes `text-[9px]`/`text-[10px]` (`3121-3147`). |
| Discount | toggle `text-[10px]`; Input `text-xs h-7`; calculated value `text-[9px] font-mono` (`3154-3188`) | Three sizes in one cell; input numeric is sans/not right-aligned. |
| Invoiced / Accepted Amount | read-only `h-8 px-2 font-mono text-xs`, accepted adds `font-medium` (`3193-3215`) | One pixel taller than most controls; accepted amount alone is medium weight. |
| Status | `LineStatusChip`: `text-[10px] font-medium px-1.5 py-0.5` (`InvoiceReviewPanels.tsx:369-386`) | Compact but no explicit line-height; differs from nearby `text-[11px]` actions. |
| Action | buttons `h-7 text-[11px] px-2` (`InvoiceScanner.tsx:3224-3287`) | 11px versus 12px cells and 10px chips. |

Additional mixed typography:

- Autocomplete results are `text-xs`, SKU is mono, supplier suffix is `text-[10px]` (`ProductAutocomplete.tsx:193-225`).
- Suggestions use `text-[11px]`, confidence is mono, and buttons are `h-6 text-[11px]` (`ProductSuggestionChip.tsx:32-140`).
- Review chips are `text-[10px]`; review drawer values are `text-xs`, with mono values and `text-[11px]` helpers (`InvoiceReviewPanels.tsx:369-439, 637-775`).
- Supplier quick-create switches to labels `text-xs` but controls `h-9 text-sm` (`SupplierQuickCreateSheet.tsx:202-215, 241-288`), larger than the review header.
- Quick-add setup also uses `h-9 text-sm`, while its scanner trigger is `h-6 text-[11px]` (`QuickAddProductPopover.tsx:395-403`).
- Price Insights introduces `text-[10px]`, `text-[11px]`, `text-xs`, `text-[13px]`, `text-[15px]`, and `text-[18px]` (`PriceHistoryPanel.tsx:654-755`). This is internally hierarchical but not aligned to the scanner’s 10/11/12px compact scale.

## 4. Wording inconsistencies

- **Master-data terminology:** “Items Master” (`InvoiceReviewPanels.tsx:729-732, 746`) versus “master”, “master item”, and “master price” (`InvoiceScanner.tsx:2604-2607, 2843-2845, 3125-3141`) versus “Internal product” / “master data setup” (`QuickAddProductPopover.tsx:405-424`). The save error says “Bills & Invoices” rather than naming the matching destination (`InvoiceScanner.tsx:1909`).
- **Product identity:** table uses “External Name” (`InvoiceScanner.tsx:2650`), autocomplete placeholder says “Item name” (`2826`), quick-add uses “Supplier product name” (`QuickAddProductPopover.tsx:426, 430`), and review details use “External Name” (`InvoiceReviewPanels.tsx:739-749`).
- **Abbreviations:** “Purch. UOM”, “Purch. Qty”, “Purch. Cost”, and “Acc. price” (`InvoiceScanner.tsx:2651-2661`) sit beside fully written “Accepted Qty” and “Accepted Amount”. “Acc. price” also uniquely uses lowercase `price`.
- **Quantity naming:** comments and helper copy alternate among Purchase Qty, Purch. Qty, Qty, Accepted Qty, and Stock Qty (`InvoiceScanner.tsx:2652-2655, 2943-2985`; `InvoiceReviewPanels.tsx:743`).
- **Button casing:** Title Case—“Add Line”, “Add Item”, “Save Draft”, “Scan Another”, “Save All”, “Override & Approve”, “Approve & Save” (`InvoiceScanner.tsx:2589, 3255-3266, 3438-3499`); sentence case—“Accept all invoice prices”, “Resolve … unmatched with AI”, “Quick add … to master”, “Change match”, “Select item”, “Edit master item” (`2590-2607, 2839-2916, 3228-3237`). ProductSuggestionChip mixes “Ask AI” with “Ask AI to match” (`ProductSuggestionChip.tsx:62-73, 111-120`).
- **Status casing:** chips use Title Case (“Blocking Issue”, “New Item”, “Possible Match”, “Needs Review”), while workflow/check copy uses sentence case (“Blocking issue”, “Review required”) (`InvoiceReviewPanels.tsx:157-208, 228-254`).

## 5. One proposed typographic standard

Use one compact, sentence-case system throughout the review surface:

- **Field labels:** `text-[11px] font-medium leading-4 text-muted-foreground`; sentence case; no uppercase and no tracking. Put every label in the same fixed `h-5 flex items-center` row, including dates and Notes.
- **Header controls:** `h-8 px-2.5 text-xs leading-4 font-normal`; sans for words, mono only for invoice numbers and dates. Apply identical inset to Input, SelectTrigger, and Textarea.
- **Table headers:** `text-[11px] font-medium leading-4 text-muted-foreground`; sentence case; `px-2 py-1.5`. Right-align numeric headers.
- **Table cells:** `text-xs leading-4`; controls `h-7 px-2`; names/reasons/notes sans; SKUs, UOM codes, dates, quantities, prices, discounts, and amounts mono with `tabular-nums`; right-align all numeric values and controls.
- **Chips:** `text-[10px] leading-4 font-medium px-1.5 py-0.5`; use the existing semantic status treatments consistently.
- **Helper text:** `text-[10px] leading-4 text-muted-foreground`; warning/destructive colour only changes tone, not size. Remove 9px and 11px one-offs from line helpers.
- **Buttons:** `text-xs font-medium`; sentence case for every text command. Keep icon-only actions icon-only.
- **Terminology:** use **Items Master** everywhere; **External name / External SKU** for supplier-facing identity; spell out **Purchase UOM**, **Purchase quantity**, **Purchase cost**, and **Accepted price**.

Specific application work would normalize the seven header label wrappers and control insets in `InvoiceScanner.tsx:2450-2581`; normalize all table headers/cells/helpers in `InvoiceScanner.tsx:2641-3296`; align autocomplete internals in `ProductAutocomplete.tsx:157-225`; align suggestion/status chips in `ProductSuggestionChip.tsx:32-140` and `InvoiceReviewPanels.tsx:369-439`; align scanner-launched sheets in `SupplierQuickCreateSheet.tsx:202-303` and `QuickAddProductPopover.tsx:395-489`; and simplify the type scale in `PriceHistoryPanel.tsx:654-755`.
