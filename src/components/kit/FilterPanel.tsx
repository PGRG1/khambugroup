import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./kit.css";

/** Filter button + popover. `resultLabel` names the outcome on the primary button ("Show 4 days"). */
export function FilterPanel({ activeCount, resultLabel, onReset, children }: { activeCount: number; resultLabel: string; onReset: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="kit kit-btn kit-btn-secondary">
          <SlidersHorizontal className="h-4 w-4" /> Filter
          {activeCount > 0 && <span className="kit-bubble">{activeCount}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="kit kit-pop w-[300px] p-0 max-h-[70vh] overflow-y-auto">
        <div className="p-4 space-y-4">{children}</div>
        <div className="flex items-center justify-between gap-2 px-4 py-3 kit-divider sticky bottom-0 bg-white">
          <button type="button" className="kit-link" onClick={onReset}>Reset</button>
          <button type="button" className="kit-btn kit-btn-primary" onClick={() => setOpen(false)}>{resultLabel}</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="kit-group-h">{title}</div>
      {children}
    </div>
  );
}

/** Multi-select chips (no checkboxes). */
export function ChoiceChips<K extends string>({ options, selected, onToggle }: { options: { key: K; label: string }[]; selected: Set<K>; onToggle: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.key} type="button" className="kit-chip kit-chip-choice" aria-pressed={selected.has(o.key)} onClick={() => onToggle(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}
