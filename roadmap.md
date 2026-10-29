# Roadmap

## Purchasing foundation — build 1 (in progress)
- [ ] Migration: invoices.held_amount, tenant_members.purchasing_role (+backfills), unique GRN-per-invoice index
- [ ] Invoice statuses: Draft/To approve badges + filters; scanner onSave mapping fix (under_review→Draft)
- [ ] Exclude Draft from Purchasing Overview + usePayables; held maths in usePayables
- [ ] Open Payables + SupplierAccount: Held column, "Held in disputes" KPI
- [ ] Purchasing role select in User Access (admins only)
- [ ] Remove door-tap pop-up + New delivery buttons; "Report a problem" on invoice detail + GRN detail
- [ ] DeliveryCheckDialog: problem-only, affected qty for all issues, held_amount update
- [ ] Purchase Orders always in nav; remove delivery-check radios (MasterData, onboarding)
- [ ] received_date = invoice date (HK) for auto-GRN + problem reports
- [ ] Tests: statuses, held maths, role backfill mapping, problem quantities, nav rule
- [ ] Browser check: Invoices, Open Payables, Goods Receipts, User Access, Purchasing Overview @1280/375
