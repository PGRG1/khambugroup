import { useState } from "react";
import { Check, ChevronDown, MapPin, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVenueScope } from "@/hooks/useVenueScope";
import { cn } from "@/lib/utils";

function Row({ label, selected, onClick, big }: { label: string; selected: boolean; onClick: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={selected}
      onClick={onClick}
      className={cn("venue-row", big ? "h-12" : "h-10", selected && "is-selected")}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
    </button>
  );
}

function Choices({ big = false }: { big?: boolean }) {
  const s = useVenueScope();
  return (
    <div role="menu" aria-label="Venues">
      <Row label={s.allLabel} selected={s.isAll} onClick={() => s.reset()} big={big} />
      <div className="venue-divider" />
      {s.venues.map((v) => (
        <Row key={v.id} label={v.name} big={big}
          selected={!s.isAll && s.scope !== "all" && s.scope.includes(v.id)}
          onClick={() => s.toggleVenue(v.id)} />
      ))}
    </div>
  );
}

/** Top-bar pill: always white; ✕ resets to all venues. Hidden for users locked to one venue. */
export function VenueScopePicker() {
  const s = useVenueScope();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  if (!s.ready || s.locked || s.venues.length === 0 || s.mode === "off") return null;
  const inactive = s.mode === "none";
  const showClear = !s.isAll;

  const trigger = (
    <button
      type="button"
      onClick={isMobile ? () => setOpen(true) : undefined}
      aria-label={inactive ? `Venue: ${s.label} (does not apply on this page)` : `Venue: ${s.label}`}
      className={cn("venue-pill-main inline-flex h-full min-w-0 items-center gap-1.5 pl-3 focus-visible:outline-none", showClear ? "pr-1" : "pr-3")}
    >
      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{s.label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
    </button>
  );

  const pill = (inner: React.ReactNode) => (
    <div className={cn("venue-pill inline-flex h-9 min-w-0 max-w-[50vw] sm:max-w-[280px] items-center rounded-full text-[13px] font-medium focus-within:ring-2 focus-within:ring-ring", inactive && "opacity-50")}>
      {inner}
      {showClear && (
        <button type="button" onClick={(e) => { e.stopPropagation(); s.reset(); }} aria-label="Show all venues"
          className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-[rgba(20,45,43,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  const note = <p className="venue-note">Applies to every page until you change it.{inactive && " This page can't be split by venue."}</p>;

  if (isMobile) {
    return (
      <>
        {pill(trigger)}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="venue-menu">
            <DrawerHeader className="text-left"><DrawerTitle>Venues</DrawerTitle></DrawerHeader>
            <div className="max-h-[60vh] overflow-y-auto px-4"><Choices big />{note}</div>
            <DrawerFooter>
              <button type="button" className="venue-done h-12 w-full rounded-lg text-[15px] font-semibold" onClick={() => setOpen(false)}>Done</button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {pill(<PopoverTrigger asChild>{trigger}</PopoverTrigger>)}
      <PopoverContent align="end" className="venue-menu venue-panel w-[240px] p-1.5"><Choices />{note}</PopoverContent>
    </Popover>
  );
}
