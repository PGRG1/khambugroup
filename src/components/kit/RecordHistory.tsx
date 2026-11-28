import { useEffect, useState } from "react";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { historyLine, historyTime, loadRecordHistory, type HistoryEvent, type HistoryKind } from "@/utils/recordHistory";

/**
 * Bottom of every bill, supplier invoice, sales day and journal: the latest event on one line,
 * "History" opens the full list (oldest first). Read-only; follows the record's own access.
 */
export function RecordHistory({ kind, id, refreshKey }: { kind: HistoryKind; id: string | null | undefined; refreshKey?: unknown }) {
  const { tenantId } = useActiveTenant();
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setEvents(null);
    if (tenantId && id) void loadRecordHistory(kind, tenantId, id).then(e => { if (active) setEvents(e); }).catch(() => { if (active) setEvents([]); });
    return () => { active = false; };
  }, [kind, tenantId, id, refreshKey]);
  if (!id || !events?.length) return null;
  const last = events[events.length - 1];
  return <div className="border-t border-border/60 pt-3 text-[13px] min-w-0" data-testid="record-history">
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate text-muted-foreground" title={historyLine(last)}>{historyLine(last)}</span>
      {events.length > 1 && <button type="button" className="shrink-0 underline underline-offset-4" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? "Hide history" : "History"}</button>}
    </div>
    {open && <ul className="mt-2 space-y-1.5">
      {events.map((e, i) => <li key={i} className="flex gap-4">
        <span className="w-[110px] shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">{historyTime(e.at)}</span>
        <span className="min-w-0">{e.text}{e.who ? ` · ${e.who}` : ""}</span>
      </li>)}
    </ul>}
  </div>;
}
