

## Fix: Separate actual vs projected lines for current month

### Problem
The current month's solid line continues showing cumulative values on days where only projected data should appear. The tooltip shows both "Apr 2026: $351,808" and "Apr 2026 (Projected): $351,898" at the same point. The user wants:
1. Solid line stops at the last actual data day
2. Dotted projection line starts from there
3. Tooltip shows only "Apr 2026" for actual days and only "Apr 2026 + Proj" for projected days

### Fix in `src/components/dashboard/CumulativeSalesChart.tsx`

**In the `cumulativeData` memo (lines 162-193):**
- After computing cumulative values for all months, for the **current month only**, set values to `undefined` for days **after** `projectionStartDay`. This stops the solid line at the last actual day.

Specifically, change the logic around line 168:
```typescript
// For current month, don't set actual values beyond the last real data day
if (mk === currentMonthKey && hasProjection && d > projectionStartDay) {
  // Don't add — let projection handle it
} else if (cumSum > 0) {
  row[mk] = cumSum;
}
```

**Tooltip (line 219):**
- Change projected label from `"${label} (Projected)"` to `"${label} + Proj."`

No other changes needed. The projection line already starts at `projectionStartDay` with the overlap point, so it will seamlessly continue from where the solid line ends.

