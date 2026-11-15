import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CategoryTree } from "@/utils/purchasingOverview";
import { cn } from "@/lib/utils";

const money = (v: number) => Math.round(v).toLocaleString("en-HK");
// A single "Other" part says nothing new, so it does not open.
const opens = (row: CategoryTree) => row.subs.length > 1 || (row.subs.length === 1 && row.subs[0].name !== "Other");

/**
 * Drill-down for one level 1 category: its level 2 parts, and a tap on one of those shows its
 * level 3 parts. A sheet from the bottom on phone, a dialog on larger screens.
 */
export function CategoryBreakdown({ category, period, onClose }: { category: CategoryTree | null; period: string; onClose: () => void }) {
  const mobile = useIsMobile();
  const [sub, setSub] = useState<CategoryTree | null>(null);
  useEffect(() => setSub(null), [category?.id]);
  const shown = sub ?? category;
  const open = !!category;
  const title = shown?.name ?? "";
  const description = `${sub ? `${category?.name} · ` : ""}${period}`;

  const body = shown && (
    <div className="px-4 pb-5 sm:px-0 sm:pb-0">
      {sub && <button type="button" onClick={() => setSub(null)} className="mb-2 -ml-1 inline-flex items-center gap-0.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden />{category?.name}
      </button>}
      <div className="flex items-baseline justify-between border-b border-border/60 pb-2 text-[13px]">
        <span className="text-muted-foreground">Total</span><b className="td-num font-semibold">{money(shown.value)}</b>
      </div>
      <ul className="divide-y divide-border/40">
        {shown.subs.map(row => {
          const part = shown.value > 0 ? Math.round(row.value / shown.value * 100) : null;
          const canOpen = !sub && opens(row);
          const inner = <>
            <span className="min-w-0 flex-1 truncate text-left">{row.name}</span>
            <span className="td-num w-[72px] text-right">{money(row.value)}</span>
            <span className="td-num w-[38px] text-right text-muted-foreground">{part == null ? "—" : `${part}%`}</span>
            <span className="w-4 shrink-0">{canOpen && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}</span>
          </>;
          return <li key={row.id}>
            {canOpen
              ? <button type="button" onClick={() => setSub(row)} className="flex w-full items-center gap-2 py-2.5 text-[13px] hover:bg-muted/40 -mx-2 px-2 rounded-md" style={{ width: "calc(100% + 16px)" }}>{inner}</button>
              : <div className="flex items-center gap-2 py-2.5 text-[13px]">{inner}</div>}
            <div className="h-1 rounded-full purchasing-track -mt-1 mb-1.5"><div className={cn("h-full rounded-full purchasing-bar")} style={{ width: `${Math.max(0, Math.min(100, part ?? 0))}%` }} /></div>
          </li>;
        })}
      </ul>
    </div>
  );

  if (mobile) return <Drawer open={open} onOpenChange={o => { if (!o) onClose(); }} shouldScaleBackground={false}>
    <DrawerContent className="bg-popover max-h-[85dvh]">
      <DrawerHeader className="text-left"><DrawerTitle>{title}</DrawerTitle><DrawerDescription>{description}</DrawerDescription></DrawerHeader>
      <div className="overflow-y-auto">{body}</div>
    </DrawerContent>
  </Drawer>;
  return <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent className="sm:max-w-[440px] max-h-[80vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      {body}
    </DialogContent>
  </Dialog>;
}

export { opens as categoryOpens };
