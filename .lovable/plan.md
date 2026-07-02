## Goal
Update Revenue sidebar labels, add a Reconciliation page shell, and wire the new route — without touching any existing Revenue functionality, data, or database.

## Verified checks

### 1. PageHeader API
The existing `PageHeader` component (used across the app, e.g. in payments pages) accepts:
- `title: string`
- `subtitle?: string`
- `right?: React.ReactNode`

The Reconciliation page shell will use `subtitle` (not `description`). No PageHeader modification needed.

### 2. Sidebar active-state matching
The sidebar uses `NavLink` with `end={item.end ?? item.url === "/"}`.

Current `revenueItems` Overview has no `end` prop, so `end` defaults to `false`. This causes `/revenue` to match `/revenue/reconciliation` via prefix matching, incorrectly highlighting Overview when Reconciliation is active.

Fix: Add `end: true` to the Overview revenue item so it matches exact `/revenue` only.

After the fix:
- `/revenue` → Overview highlighted
- `/revenue/reconciliation` → Reconciliation highlighted
- `/sales-data` → Daily Sales highlighted
- `/forecast/assembly` → Targets highlighted

## Changes

### 1. `src/components/AppSidebar.tsx`
Update the `revenueItems` array (line 29):

- Overview: add `end: true` to prevent prefix-match bleed into nested route
- Rename "Sales Data" → "Daily Sales" (keep `/sales-data`)
- Rename "Target Tracking" → "Targets" (keep `/forecast/assembly`)
- Add new item: `{ title: "Reconciliation", url: "/revenue/reconciliation", icon: Scale, pageKey: "revenue" }`

Order after change:
1. Overview (`/revenue`, `end: true`)
2. Daily Sales (`/sales-data`)
3. Targets (`/forecast/assembly`)
4. Reconciliation (`/revenue/reconciliation`)

The `Scale` icon is already imported in AppSidebar.

### 2. New file: `src/pages/revenue/Reconciliation.tsx`
Create a clean page shell using the existing BANI design system.

Content:
- **PageHeader** (title: "Revenue Reconciliation", subtitle: "Compare reported revenue with the customer payment methods recorded for each business date and venue.")
- Empty-state card with text: "Revenue reconciliation has not been configured yet."
- Disabled button: "Set Up Reconciliation"

No data fetching, no queries, no mock data, no KPIs, no charts.

### 3. `src/App.tsx`
Add import for the new `Reconciliation` page.

Add route (placed with existing Revenue routes, before catch-all):
```tsx
<Route
  path="/revenue/reconciliation"
  element={
    <ProtectedRoute pageKey="revenue">
      <Reconciliation />
    </ProtectedRoute>
  }
/>
```

## Pre-implementation checks

Before editing:
1. The existing PageHeader uses `subtitle` — no prop changes needed.
2. The AppSidebar active-route logic requires `end: true` on the Overview item to prevent incorrect prefix matching on `/revenue/reconciliation`.
3. The new route will be placed alongside existing Revenue routes and before any catch-all.
4. TypeScript/build checks will be run after implementation.

## What will NOT change
- Revenue Overview (`/revenue`) and its Daily/Monthly toggle
- Sales Data (`/sales-data`, `/sales-data/:id`) and DataPage
- Forecast/Targets (`/forecast/:venue`) and ForecastInput
- Any calculations, charts, database tables, or other modules

## Post-implementation report
- **Routes added**: `/revenue/reconciliation`
- **Nav labels changed**: Sales Data → Daily Sales, Target Tracking → Targets
- **Files changed**: `src/components/AppSidebar.tsx`, `src/App.tsx`
- **New files created**: `src/pages/revenue/Reconciliation.tsx`
- **Existing pages reused**: `Index` (Overview), `DataPage` (Daily Sales), `ForecastInput` (Targets)
- **Confirmation**: No Revenue functionality, calculations, data, or database structures will be modified.