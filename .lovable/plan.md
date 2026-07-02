# Split Payments & Petty Cash into standalone pages

Extract each tab block from the two aggregate pages into its own route-backed page. No shared TABS array, no `useSearchParams`, no tab bar in any new file.

## 1. Read source files
- `src/pages/payments/PaymentsPage.tsx` — extract 8 tab blocks verbatim (including local state, dialogs, handlers used only inside each block).
- `src/pages/petty-cash/PettyCashPage.tsx` — extract 5 tab blocks verbatim.
- `src/components/AppSidebar.tsx` — locate the payments/petty-cash nav entries currently using `?tab=` query strings.

## 2. Create new Payments pages
Each file: standalone component, calls `usePaymentSettlements()` and `useBankModule()` as needed, owns its own local state (processor selector, dialog open flags, form state). Imports the existing tab components unchanged.

- `src/pages/payments/PaymentsDashboardPage.tsx` ← `overview` block (processor selector + KPIs + workflow stepper + processor cards + recent batches).
- `src/pages/payments/PaymentsBatchesPage.tsx` ← `batches` block → `<SettlementBatchesTab>`.
- `src/pages/payments/PaymentsFeeAuditPage.tsx` ← `details-audit` block → `<SettlementDetailsAuditTab>`.
- `src/pages/payments/PaymentsMonthlyPage.tsx` ← `monthly-recon` block → `<MonthlyReconciliationTab>`.
- `src/pages/payments/PaymentsProcessorsPage.tsx` ← `processors` block (CRUD table + dialog).
- `src/pages/payments/PaymentsMerchantsPage.tsx` ← `merchants` block → `<MerchantsTab>`.
- `src/pages/payments/PaymentsFeeRatesPage.tsx` ← `fee-rates` block → `<FeeRatesTab>`.
- `src/pages/payments/PaymentsImportsPage.tsx` ← `imports` block → `<ImportsTab>`.

Delete `src/pages/payments/PaymentsPage.tsx`.

### Processor selector state — confirmed behaviour
Each new Payments page that renders a processor selector owns its **own independent** `processorId` state. Selecting a processor on `PaymentsBatchesPage` does NOT affect `PaymentsDashboardPage` or any other page. This is the intended behaviour of the split.

Additionally, **every** page that renders a processor selector must include the `didInit` initialisation logic from the original `PaymentsPage.tsx`:

```ts
const kpay = processors.find(p => /kpay/i.test(p.name)) || processors[0];
if (kpay) setProcessorId(kpay.id);
setDidInit(true);
```

This must be present in — do not omit from — any of:
`PaymentsDashboardPage`, `PaymentsBatchesPage`, `PaymentsFeeAuditPage`, `PaymentsMonthlyPage`, `PaymentsMerchantsPage`, `PaymentsFeeRatesPage`, `PaymentsImportsPage`.

Pages that don't need a processor context (`PaymentsProcessorsPage`) skip this.

## 3. Create new Petty Cash pages
Each file calls `usePettyCash()` directly.

- `src/pages/petty-cash/PettyCashOverviewPage.tsx` ← `overview`.
- `src/pages/petty-cash/PettyCashReceiptsPage.tsx` ← `receipts`.
- `src/pages/petty-cash/PettyCashFloatsPage.tsx` ← `floats`.
- `src/pages/petty-cash/PettyCashClassificationsPage.tsx` ← `classifications`.
- `src/pages/petty-cash/PettyCashReplenishmentsPage.tsx` ← `replenishments`.

Delete `src/pages/petty-cash/PettyCashPage.tsx`.

## 4. Update routing — `src/App.tsx`
Replace the single `/payments` route with 8 `<AdminRoute>` routes and the single `/petty-cash` route with 5 `<AdminRoute>` routes, using the paths in the request. Update imports accordingly.

## 5. Update sidebar — `src/components/AppSidebar.tsx`
Swap `?tab=` URLs for canonical routes:

- Payments: Overview `/payments`; Master `/payments/processors`, `/payments/merchants`, `/payments/fee-rates`; Ops `/payments/imports`, `/payments/batches`, `/payments/fee-audit`; Recon `/payments/monthly`.
- Petty Cash: Overview `/petty-cash`; Ops `/petty-cash/receipts`, `/petty-cash/replenishments`; Master `/petty-cash/floats`, `/petty-cash/classifications`.

No other sidebar changes.

## Out of scope
No changes to `SettlementBatchesTab`, `MerchantsTab`, `FeeRatesTab`, `ImportsTab`, `SettlementDetailsAuditTab`, `MonthlyReconciliationTab`, `usePaymentSettlements`, `usePettyCash`, or any other pages.
