## Add dispute reason tooltip to Disputed status badge

**File:** `src/components/procurement/ProcurementInvoicesTab.tsx` (lines ~2114-2123)

Wrap the status badge in a Tooltip only when `review_status === "Disputed"`. Approved/Voided rows render the badge unchanged.

```tsx
<TableCell className="py-2">
  {(() => {
    const rs = inv.review_status || "Approved";
    const badge = (
      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium border ${REVIEW_BADGE[rs] || "bg-muted text-muted-foreground border-border"}`}>
        {rs}
      </span>
    );
    if (rs === "Disputed") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild><span>{badge}</span></TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-pre-line text-xs">
              {inv.dispute_notes?.trim() ? inv.dispute_notes : "No reason provided"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return badge;
  })()}
</TableCell>
```

Tooltip imports already exist (line 28). `dispute_notes` already exists on the `Invoice` type. No styling, no logic, no other rows affected.