## Goal

Move venue service period configuration out of the Targets flow into a dedicated `/revenue/service-periods` page.

## New route & navigation

**`src/App.tsx`** — add import `ServicePeriods from "./pages/revenue/ServicePeriods"` and route:
```tsx
<Route path="/revenue/service-periods"
  element={<ProtectedRoute pageKey="revenue"><ServicePeriods /></ProtectedRoute>} />
```

**`src/components/AppSidebar.tsx`** — extend `revenueItems` (line 29), placed after Targets and before Reconciliation:
```ts
{ title: "Service Periods", url: "/revenue/service-periods", icon: Clock, pageKey: "revenue" }
```
`Clock` is already in the lucide-react import on line 1 — do not duplicate.

## New page: `src/pages/revenue/ServicePeriods.tsx`

Hand-rolled header (h1 + muted subtitle) matching `RevenueTargets.tsx` / `DataPage.tsx`. Card containers use `card-glass`. Status uses inline `Badge` from `@/components/ui/badge`.

**Top bar**
- Venue selector (`Select` from `@/components/ui/select`) populated from `useVenues()` (filter `is_active`). Selection stored in local state; defaults to the first active venue.

**Periods table** (card-glass)
- Fetch via `useVenueServicePeriods([selectedVenueId])`, use its `rows`, `loading`, `refetch`.
- Columns: Name (with "Auto-managed rollup" note when `isRollupOnly`) · Time (`HH:mm – HH:mm`, `+1d` when `crossesMidnight`) · Weekdays (formatted from `applicableWeekdays`; "Every day" when all 7) · Effective range · Sort · Status (Active/Inactive Badge + Rollup-only Badge) · Actions.
- Actions column only rendered when `canEditManagerTargets`: Edit (populates form), Deactivate (opens `AlertDialog`, then calls `deactivateServicePeriod(id)`). Rollup-only rows hide both actions.
- Empty and loading states.

**Add / Edit form** (inline card-glass block that appears when Add clicked or a row edited)
Fields with `Input`/`Checkbox`/`Label`:
- Name (required)
- Sort order (number)
- Start time / End time (`type="time"`)
- Effective from (default today) / Effective to (optional)
- Applicable weekdays: 7 pill buttons rendered **Sunday-first** in the order Sun, Mon, Tue, Wed, Thu, Fri, Sat. The button values and stored `applicableWeekdays` remain the canonical Postgres `EXTRACT(DOW …)` numbers **0=Sunday, 1=Mon, …, 6=Saturday** — no Monday-first remapping. The weekday label used in the table also follows this Sunday-first order.
- Crosses midnight checkbox
- Active checkbox (default true)

Submit calls `upsertServicePeriod({ id?, venueId: selectedVenueId, name, startTime, endTime, crossesMidnight, applicableWeekdays, isActive, sortOrder, effectiveFrom, effectiveTo })` from `useRevenueTargetMutations`. On success: toast, `refetch()`, close form. Validates non-empty name and at least one weekday. Never sets `isRollupOnly`.

**Permissions**
- Reuse `useRevenueTargetPermissions()`. `canEditManagerTargets` gates the Add button, row actions, and the form itself. Everyone with route access sees the list.

## Explicit non-goals

- Do not modify `src/pages/RevenueTargets.tsx`.
- Do not add mutation methods to `useVenueServicePeriods`; writes go through `useRevenueTargetMutations`.
- Do not touch `useServicePeriods` / `service_periods` (System Configuration).
- No hard delete.

## Files touched

- **New**: `src/pages/revenue/ServicePeriods.tsx`
- **Edit**: `src/App.tsx` (import + route)
- **Edit**: `src/components/AppSidebar.tsx` (one entry in `revenueItems`)

## Verification

- TypeScript passes.
- Sidebar shows "Service Periods" under Revenue for users with `revenue` access.
- Selecting a venue lists its periods; add/edit/deactivate refresh the table.
- Read-only users see the list without Add/Edit/Deactivate controls.
