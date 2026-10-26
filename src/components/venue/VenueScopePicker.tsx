import { useState } from "react";
import { ChevronDown, MapPin, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVenueScope } from "@/hooks/useVenueScope";
import { cn } from "@/lib/utils";

function Choices({ big = false }: { big?: boolean }) {
  const s = useVenueScope();
  const row = cn("flex w-full items-center gap-3 rounded-md px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", big ? "min-h-12" : "min-h-10");
  return (
    <div className="space-y-0.5">
      <label className={row}>
        <Checkbox checked={s.isAll} onCheckedChange={() => s.reset()} aria-label={s.allLabel} />
        <span className="font-medium">{s.allLabel}</span>
      </label>
      <div className="my-1 h-px bg-border" />
      {s.venues.map((v) => (
        <label key={v.id} className={row}>
          <Checkbox checked={!s.isAll && s.scope !== "all" && s.scope.includes(v.id)} onCheckedChange={() => s.toggleVenue(v.id)} aria-label={v.name} />
          <span className="truncate">{v.name}</span>
        </label>
      ))}
    </div>
  );
}

/** Top-bar pill. Hidden for users locked to one venue. */
export function VenueScopePicker() {
  const s = useVenueScope();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  if (!s.ready || s.locked || s.venues.length === 0 || s.mode === "off") return null;
  const inactive = s.mode === "none";
  const dark = !s.isAll && !inactive;

  const pill = (
    <button
      type="button"
      onClick={isMobile ? () => setOpen(true) : undefined}
      aria-label={inactive ? `Venue: ${s.label} (does not apply on this page)` : `Venue: ${s.label}`}
      className={cn(
        "venue-pill inline-flex h-9 min-w-0 max-w-[46vw] sm:max-w-[260px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dark ? "venue-pill-dark border-transparent" : "border-border bg-card/80 text-foreground hover:bg-card",
        inactive && "opacity-50",
      )}
    >
      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{s.label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
    </button>
  );

  const note = <p className="px-2 pt-2 text-[11px] text-muted-foreground">Applies to every page until you change it.{inactive && " This page can't be split by venue."}</p>;

  if (isMobile) {
    return (
      <>
        {pill}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader className="text-left"><DrawerTitle>Venues</DrawerTitle></DrawerHeader>
            <div className="max-h-[60vh] overflow-y-auto px-4"><Choices big />{note}</div>
            <DrawerFooter><Button className="h-12" onClick={() => setOpen(false)}>Done</Button></DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{pill}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2"><Choices />{note}</PopoverContent>
    </Popover>
  );
}

/** Reminder shown above page content whenever the scope isn't "all venues". */
export function VenueScopeReminder() {
  const s = useVenueScope();
  if (!s.ready || s.mode === "off" || s.locked) return null;
  if (s.mode === "none") {
    if (s.isAll) return null;
    return <p className="mb-3 text-[12px] text-muted-foreground">All venues: this page can't be split by venue</p>;
  }
  if (s.isAll) return null;
  return (
    <div className="mb-3 flex">
      <span className="venue-pill-dark inline-flex h-8 max-w-full items-center gap-1 rounded-full pl-3 pr-1 text-[12px] font-medium">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="truncate focus-visible:outline-none focus-visible:underline">{s.reminder}</button>
          </TooltipTrigger>
          <TooltipContent>{s.selectedNames.join(", ")}</TooltipContent>
        </Tooltip>
        <button type="button" onClick={s.reset} aria-label="Show all venues" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-background/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}
