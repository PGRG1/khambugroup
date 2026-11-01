import { useMemo, type ReactNode } from "react";
import { usePageTopSlots, type PageTopSlot } from "./PageTopSlots";

/**
 * The one page top used everywhere.
 * Row 1: title · short grey detail · at most one primary button (right).
 * Row 2: Period → view switches/search/filter (left); sort, columns, page actions, download last (right).
 * Then the Bani card slot. Content tables portal their controls into row 2.
 */
export function PageTop({ title, titleDetail, primary, period, controls, actions, download, bani, back, actionsBesideTitle = false }: {
  title: ReactNode; titleDetail?: ReactNode; primary?: ReactNode; period?: ReactNode; controls?: ReactNode;
  actions?: ReactNode; download?: ReactNode; bani?: ReactNode; back?: ReactNode; actionsBesideTitle?: boolean;
}) {
  const ctx = usePageTopSlots();
  const register = ctx?.register;
  const refs = useMemo(() => Object.fromEntries((["left", "tools", "download", "bani"] as PageTopSlot[]).map((s) => [s, (el: HTMLDivElement | null) => register?.(s, el)])) as Record<PageTopSlot, (el: HTMLDivElement | null) => void>, [register]);
  const slot = (s: PageTopSlot) => refs[s];
  const main = primary ?? (actionsBesideTitle ? actions : undefined);
  const rightActions = actionsBesideTitle ? undefined : actions;
  return (
    <div className="page-top space-y-3">
      <div className="page-top-row1 flex items-center justify-between gap-3 min-h-9">
        <div className="flex min-w-0 items-center gap-2">
          {back}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
            <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">{title}</h1>
            {titleDetail && <div className="page-top-detail text-sm text-muted-foreground min-w-0">{titleDetail}</div>}
          </div>
        </div>
        {main && <div className="page-top-primary shrink-0">{main}</div>}
      </div>
      <div className="page-top-row2 flex flex-wrap items-center justify-between gap-2">
        <div className="page-top-left flex flex-wrap items-center gap-2 min-w-0">
          {period && <div className="pt-slot">{period}</div>}
          {controls && <div className="pt-slot flex flex-wrap items-center gap-2">{controls}</div>}
          <div ref={slot("left")} className="pt-slot flex flex-wrap items-center gap-2" />
        </div>
        <div className="page-top-right flex flex-wrap items-center gap-2 sm:ml-auto">
          <div ref={slot("tools")} className="pt-slot flex flex-wrap items-center gap-2" />
          {rightActions && <div className="pt-slot flex flex-wrap items-center gap-2">{rightActions}</div>}
          <div ref={slot("download")} className="pt-slot flex items-center gap-2">{download}</div>
        </div>
      </div>
      <div ref={slot("bani")} className="page-top-bani space-y-2">{bani}</div>
    </div>
  );
}
