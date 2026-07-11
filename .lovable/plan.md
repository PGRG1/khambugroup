# Fix: onboarding cockpit deep-links leak admin's own tenant data

## Confirmed mechanism

Every regular tenant-scoped page/hook resolves `tenant_id` via `useActiveTenant` (`src/hooks/useActiveTenant.ts`), which reads `localStorage["khambu.activeTenantId"]`. That value is set by `TenantSwitcher` and defaults to the logged-in user's first membership. There is no notion of "acting on tenant X from the platform admin cockpit" — so any deep link out of the cockpit renders the admin's *own* active tenant's data (KHAMBU), not the client being onboarded.

Good news: `useActiveTenant.setTenantId()` already exists and already broadcasts a change event + clears the React Query cache. Super admins can hold any tenant_id. We can build the preview mode on top of it — no per-hook rewrite required.

## Affected deep-links (all from `OnboardingSteps.tsx`)

- `/finance/chart-of-accounts` (StepCoA — twice)
- `/procurement/suppliers` (StepSuppliers)
- `/admin/master-data` (StepRevenue)
- `/sales-data` (StepFirstSale)
- `/procurement/invoices` (StepFirstInvoice)
- `/procurement/opening-balances` (StepAP/AR opening)
- `/user-access` (StepTeam)

Same blind spot exists on `/admin/structure` and `/admin/clients/:tenantId` if a platform admin browses there directly, but those already read `tenantId` from the URL, so they're fine.

## Fix approach

1. **New `TenantPreviewProvider`** (mounted above `AppLayout` in `App.tsx`). Stores `{ previewTenantId, previewTenantName, enter(id, name), exit() }` in memory + `sessionStorage` so a page refresh inside the cockpit doesn't drop the preview.

2. **Extend `useActiveTenant`**: when a preview is active AND the user `isSuperAdmin`, `tenantId` returned = `previewTenantId` (overrides localStorage). `setTenantId` while previewing updates the preview target, not the admin's real active tenant. On `exit()`, revert to the admin's own last-selected tenant (already in localStorage). Also `queryClient.clear()` on enter/exit so no stale rows bleed across tenants.

3. **Auto-enter on cockpit mount**: `ClientOnboarding.tsx` calls `enter(tenantId, tenantName)` in a `useEffect`, and does NOT auto-exit on unmount (so deep-links keep the preview alive). Fetch the tenant name for the banner.

4. **Auto-exit triggers**:
   - Explicit "Exit preview" button in the banner.
   - Navigating to any `/platform/*` route (except the cockpit itself and `/platform/clients/:id`).
   - Sign-out.

5. **Unmissable banner** (`TenantPreviewBanner`, mounted in `AppLayout` above the header, similar to `PreviewBanner`): full-width, `bg-warning`/amber, sticky, text: `Previewing client: <Name> — you are editing THEIR data, not your own.` with an `Exit preview` button. Non-dismissible. Also tint the sidebar top-border amber for extra signal.

6. **Guardrails**:
   - Only activates when `usePlatformAdmin().isPlatformAdmin === true`. A regular tenant admin never sees or triggers it.
   - Preview target is validated against `tenants` table on `enter()` (already the pattern in `useActiveTenant`).
   - `TenantSwitcher` is hidden (or disabled with a tooltip "Exit preview to switch") while preview is active, so the admin can't accidentally desync the two states.

7. **No per-page changes required** — because every hook already reads through `useActiveTenant`, the override is transparent. Deep-link `<Link to="/finance/chart-of-accounts">` etc. keep working as-is.

## Technical details

- Files added: `src/contexts/TenantPreviewContext.tsx`, `src/components/access-control/TenantPreviewBanner.tsx`.
- Files edited: `src/App.tsx` (wrap providers), `src/components/AppLayout.tsx` (mount banner + top padding), `src/hooks/useActiveTenant.ts` (preview-aware resolution + `queryClient.clear()` on enter/exit), `src/pages/admin/ClientOnboarding.tsx` (auto-enter on mount, fetch tenant name), `src/components/TenantSwitcher.tsx` (disable when previewing).
- No DB changes, no RLS changes. RLS still enforces membership: a platform admin (super_admin role) already has cross-tenant read/write through their role — this fix only changes *which* tenant the UI targets, not what the server allows.
- Typecheck after.

## Out of scope for this PR

- Read-only mode for non-onboarding pages reached via preview. Deferred: the banner + explicit enter/exit + query cache clear is sufficient signal; a full read-only overlay is a larger change and can follow if you want belt-and-braces.
