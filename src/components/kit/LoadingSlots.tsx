import { Skeleton } from "@/components/ui/skeleton";

/** Static placeholders: the loaded slot, not the shell, owns the reveal. */
export function LoadingLines({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return <div role="status" aria-label="Loading" className={`space-y-3 ${className}`}>
    {Array.from({ length: rows }, (_, i) => <div key={i} className="flex min-h-11 items-center justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3 w-3/4 !animate-none" /><Skeleton className="h-3 w-1/2 !animate-none" /></div>
      <Skeleton className="h-5 w-20 shrink-0 !animate-none" />
    </div>)}
  </div>;
}

/** Semantic table geometry, with a two-line phone list at the same breakpoint. */
export function LoadingTable({ headings, rows = 6, mobile = false }: { headings: string[]; rows?: number; mobile?: boolean }) {
  return <div role="status" aria-label="Loading records">
    {mobile && <LoadingLines rows={rows} className="min-[641px]:hidden px-3" />}
    <div className={`${mobile ? "hidden min-[641px]:block " : ""}max-w-full overflow-x-auto`}>
      <table className="w-full table-fixed text-sm"><thead className="border-y border-border text-xs text-muted-foreground"><tr>{headings.map(h => <th key={h} className="h-11 px-3 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>{Array.from({ length: rows }, (_, i) => <tr key={i} className="border-b border-border/50">{headings.map(h => <td key={h} className="h-11 px-3"><Skeleton className="h-3 w-3/4 !animate-none" /></td>)}</tr>)}</tbody>
      </table>
    </div>
  </div>;
}