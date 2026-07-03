## Scope
All changes are in `src/pages/RevenueTargets.tsx` plus a small addition to `src/components/revenue-targets/AdjustmentReasonDialog.tsx` to register a new `"manual_override"` kind. Frontend only — no backend/RPC/schema changes. `EventTable` is untouched.

## 1. Pre-fill Guest / SPG inputs from statistical benchmark

In `ServicePeriodTable`, compute effective display values for the two editable cells:

```ts
const effGuest = l.managerGuestTarget ?? statForPeriod?.statisticalGuestTarget ?? null;
const effSpg   = l.managerSpendPerGuestTarget ?? statForPeriod?.statisticalSpendPerGuest ?? null;
const guestIsPrefill = l.managerGuestTarget == null && statForPeriod?.statisticalGuestTarget != null;
const spgIsPrefill   = l.managerSpendPerGuestTarget == null && statForPeriod?.statisticalSpendPerGuest != null;
```

Bind the two `<Input>`s to `effGuest ?? ""` / `effSpg ?? ""`. When the prefill flag is true, add `text-muted-foreground` to the input's className; otherwise leave normal `text-foreground`. Read-only fallback (non-edit mode) uses the same effective value with matching muted styling when it is a prefill.

`onChange` still writes to `managerGuestTarget` / `managerSpendPerGuestTarget` in `pendingEdits`. Clearing the input writes `null`, reverting to the statistical prefill.

## 2. Correct `managerSource` on save; add independent manual_override trigger

Add helper above `performSaveDay`:

```ts
const EPS = 0.01;
const resolveManagerSource = (t: ManagerTargetLine): "manual" | "statistical_default" => {
  const s = statistical.find((r: any) =>
    r.venueId === t.venueId && r.targetDate === t.targetDate && r.servicePeriodId === t.servicePeriodId);
  const sg = s?.statisticalGuestTarget ?? null;
  const ss = s?.statisticalSpendPerGuest ?? null;
  const g  = t.managerGuestTarget;
  const p  = t.managerSpendPerGuestTarget;
  const gMatches = g == null || (sg != null && Math.abs(Number(g) - Number(sg)) <= EPS);
  const pMatches = p == null || (ss != null && Math.abs(Number(p) - Number(ss)) <= EPS);
  return gMatches && pMatches ? "statistical_default" : "manual";
};
```

Replace both literal `managerSource: "manual",` occurrences with `managerSource: resolveManagerSource(t),` — locate by string match: one inside `performSaveDay`'s payload builder, one inside `saveAll`'s payload builder.

**Do not touch** `varianceExceedsThreshold` or the existing `requestReason("variance_threshold", …)` flow.

**New independent trigger — per-line default → manual transition.** In `saveDay`, compute:

```ts
const hasManualOverrideTransition = targets.some((t) => {
  const original = managerLines.find((l) => l.id === t.id);
  const wasDefault = !original || original.managerSource == null || original.managerSource === "statistical_default";
  return wasDefault && resolveManagerSource(t) === "manual";
});
```

Trigger order in `saveDay`:
1. If `varianceExceedsThreshold(venueId, date, targets)` → `requestReason("variance_threshold", …)` (existing, unchanged).
2. Else if `hasManualOverrideTransition` → `requestReason("manual_override", async (reason) => { setReasonReq(null); await performSaveDay(venueId, date, targets, reason); })`.
3. Else → `performSaveDay(...)` with no reason.

**Register the new kind** in `src/components/revenue-targets/AdjustmentReasonDialog.tsx`:
- Extend `AdjustmentReasonKind` union with `"manual_override"`.
- Add to `HEADINGS`: `manual_override: "Reason: Manager Override"`.
- Add to `HINTS`: `manual_override: "You're overriding the statistical benchmark for this line — add a note explaining why."`.

## 3. Per-row source badge

In `ServicePeriodTable`, render one small badge in the Actions cell per row, driven by `l.managerSource`:

- `"statistical_default"` (or null) → `<Badge variant="outline" className="text-[10px]">Statistical</Badge>`
- `"manual"` → `<Badge variant="default" className="text-[10px]">Manager override</Badge>`

Only render when `l.lineStatus === "operating"`.

## 4. Rename "Use Stat" → "Use Statistical"

In `ServicePeriodTable`, locate the button by its JSX text `Use Stat` and rename the visible label to `Use Statistical`. Leave the existing disabled-state tooltip `"Full-Day benchmark cannot be applied to a service period"` unchanged. No behavior change.

## 5. Revenue stays computed (no change)

`Mgr Rev` cell continues to render `managerRevenue(l)` read-only. No input added anywhere.

## Verification

- `npx tsc --noEmit` passes.
- Fresh day: Guest/SPG inputs display statistical values in muted text; badge = "Statistical".
- Typing a new value: text switches to normal weight; on save, DB `manager_source` = `"manual"`, badge → "Manager override".
- Save without touching anything (or re-typing to match stat within 0.01): `manager_source` stays `"statistical_default"`, badge stays "Statistical", no reason dialog appears.
- **Independence A**: aggregate day variance <15% but one line's Guest/SPG changed from statistical default → `manual_override` reason dialog fires (new kind, distinct copy).
- **Independence B**: aggregate variance >15% still fires `variance_threshold` dialog exactly as before.
- `Mgr Rev` column has no `<input>` and continues showing `Guest × SPG`.
- `EventTable` unchanged.
