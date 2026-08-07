# Quick Add to Product Master from the invoice scanner

Let an unmatched scanned line become a real Product Master item in one click, with the full setup (categories, UOM conversions, GL mapping) deferred to the Product Master tab later.

## The flow

On any unmatched line in the scanner (next to the existing "Did you mean?" suggestion chip) add a **+ Quick add** button. The popover opens with two modes, because a scanned line is either a genuinely new product or the same product bought from a new supplier.

### Mode A — New supplier for an existing product (default when a likely match exists)

The case where you already stock Stella from supplier X and start buying it from supplier Y: the internal SKU and internal name stay exactly the same, only the supplier-side data is new.

The popover opens on this mode whenever the fuzzy matcher finds a candidate, showing "Looks like you already have this — **Stella Artois (BEV-0042)**" with a searchable product picker to change the pick. Fields:

- Existing product (picker; internal SKU + internal name shown read-only once chosen)
- Supplier (locked to the invoice supplier)
- External SKU / external name (from the scanned line)
- Purchase UOM + unit cost (from the scanned line)

Confirm creates **only** a `product_suppliers` row against the chosen `product_master_id`. Nothing on the shared product is overwritten — categories, financial treatment and GL account are inherited, so this item is immediately fully set up and does **not** land in the "Needs setup" list.

### Mode B — Brand new product

Used when nothing matches, or when you switch modes manually. Pre-filled from the scanned line:

- Internal name (defaults to the scanned description)
- Internal SKU (auto-generated, e.g. `QA-0001`, editable)
- Supplier (locked to the invoice supplier)
- External SKU / external name (from the scanned line)
- Purchase UOM + unit cost (from the scanned line)

Confirm creates:
- one `product_master` row (status `Draft`, no categories, no financial treatment, no GL account)
- one `product_suppliers` row linking it to this invoice's supplier

If the typed internal SKU already exists, the popover switches itself to Mode A against that product rather than creating a duplicate.

In both modes the line is immediately linked to the resulting supplier entry, exactly as if it had been matched — no re-scan, no page change.

A **Quick add all unmatched** button sits next to the existing "Resolve unmatched with AI" button. It opens one review list where each line is pre-set to Mode A (with its best candidate) or Mode B, so you can eyeball the split and confirm in one go.


## Where you follow up later

Procurement → **Products** (Product Master tab). Only Mode B (brand new) items need follow-up; Mode A items are already complete. They are findable two ways that already exist:

- the **Mapping** filter → `Unmapped` (no financial treatment / GL account yet)
- the **Status** filter → `Draft` (new value, added alongside Active/Inactive)

A small "Needs setup (N)" pill at the top of the Product Master tab jumps straight to that filtered view. Editing a draft and saving a financial treatment + GL account is what promotes it to Active — same 2-click edit flow as today, nothing new to learn.

Also surfaced in the scanner review: a note that quick-added new items still need categorisation, so nothing silently slips through.

## Guardrails

- Duplicate protection: the fuzzy matcher runs before creating, and a strong candidate flips the popover to Mode A so we don't seed near-duplicate internal SKUs.
- Same supplier, same external SKU already on that product → the popover says "this supplier entry already exists" and just links the line instead of inserting a second row.
- Mode A never writes to the shared `product_master` row, so adding Stella from a second supplier cannot change categories, treatment or GL mapping for the existing product.
- Drafts have no GL account, so they cannot be posted to a wrong account by accident — invoice approval already blocks on unmapped items where it does today; that behaviour is unchanged.

## Technical notes

- New component `src/components/invoices/QuickAddProductPopover.tsx`, used from `InvoiceScanner.tsx` (unmatched row) and reusable from `ProcurementInvoicesTab.tsx`.
- Mode A calls the existing `useProductMaster().addSupplierEntry({ product_master_id, supplier, external_sku, supplier_product_name, purchase_unit, purchase_unit_cost, ... })`. Mode B calls `createProduct` (which already reuses an existing internal SKU when it collides). No new tables, no schema change. `status: "Draft"` is a new value in the existing text column.
- After creation, refresh the product master list and call the scanner's existing `selectProduct(i, entry)` with the newly created supplier-scoped entry, so all matched fields (SKU, UOM, master price) populate through the normal path — the resolver is supplier-scoped, so the correct supplier row is what gets linked.
- SKU generator (Mode B only): max existing `QA-####` + 1, computed client-side from the loaded product list.
- `ProductMasterTab.tsx`: add `Draft` to the status filter options and the "Needs setup" pill.

