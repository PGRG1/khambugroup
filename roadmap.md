# Roadmap

## Sales receipt evidence memory — Step 1
- [x] Audit scan/save, schema and access paths
- [x] Add immutable extraction and saved correction evidence, scoped retrieval
- [x] Integrate non-blocking capture without changing UI or financial saves
- [x] Run 28 focused tests; validate schema/deployment and signed-in retrieval/access rejection (no production financial writes)

## Purchasing foundation — build 1 (done; browser check pending)
- [x] Migration: invoices.held_amount, tenant_members.purchasing_role (+backfills), unique GRN-per-invoice index
- [x] Invoice statuses: Draft/To approve badges + filters; scanner onSave mapping fix (under_review→Draft)
- [x] Exclude Draft from Purchasing Overview + usePayables; held maths in usePayables
- [x] Open Payables + SupplierAccount: Held column, "Held in disputes" KPI
- [x] Purchasing role select in User Access (admins only)
- [x] Remove door-tap pop-up + New delivery buttons; "Report a problem" on invoice detail + GRN detail
- [x] DeliveryCheckDialog: problem-only, affected qty for all issues, held_amount update
- [x] Purchase Orders always in nav; remove delivery-check radios (MasterData, onboarding)
- [x] received_date = invoice date (HK) for auto-GRN + problem reports
- [x] Tests: statuses, held maths, role backfill mapping, problem quantities, nav rule
- [x] Browser check: Invoices, Open Payables, Goods Receipts, User Access, Purchasing Overview @1280/375
