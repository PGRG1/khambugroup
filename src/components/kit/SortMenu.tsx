import { useState } from "react";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./kit.css";

/** Sort button stating the order in words, with a plain list. */
export function SortMenu<K extends string>({ options, value, onChange }: { options: { key: K; label: string; compactLabel?: string }[]; value: K; onChange: (k: K) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value)?.label ?? "Sort";
  const compact = options.find((o) => o.key === value)?.compactLabel;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="kit kit-btn kit-tool-btn" aria-label={`Sort: ${current}`}>
          <ArrowUpDown className="h-4 w-4" /> {compact ? <><span className="max-[640px]:hidden">{current}</span><span className="min-[641px]:hidden">{compact}</span></> : current} <ChevronDown className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="kit kit-pop w-56 p-1.5" role="menu">
        {options.map((o) => (
          <button key={o.key} type="button" role="menuitemradio" aria-checked={o.key === value} className="kit-sort-row"
            onClick={() => { onChange(o.key); setOpen(false); }}>
            <span className="kit-row-label">{o.label}</span>
            {o.key === value && <Check className="kit-row-check" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
