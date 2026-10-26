import { useState } from "react";
import { Check, Columns3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./kit.css";

/** "Columns" button with a list of toggle rows (mint + check when on). */
export function ColumnsMenu<K extends string>({ options, selected, onToggle }: { options: { key: K; label: string }[]; selected: Set<K>; onToggle: (k: K) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="kit kit-btn kit-btn-secondary" aria-label="Choose columns">
          <Columns3 className="h-4 w-4" /> Columns{selected.size > 0 && <span className="kit-bubble">{selected.size}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="kit kit-pop w-60 p-1.5" role="menu">
        {options.map((o) => (
          <button key={o.key} type="button" role="menuitemcheckbox" aria-checked={selected.has(o.key)} className="kit-sort-row" onClick={() => onToggle(o.key)}>
            {o.label}
            {selected.has(o.key) && <Check className="h-4 w-4" style={{ color: "var(--kit-petrol)" }} />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
