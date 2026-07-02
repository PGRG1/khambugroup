import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Filter, X } from "lucide-react";

export interface NumericRange {
  min?: number;
  max?: number;
}

interface Props {
  columnKey: string;
  label: string;
  range: NumericRange | null;
  onChange: (col: string, range: NumericRange | null) => void;
}

function isActive(r: NumericRange | null): boolean {
  return !!r && (r.min !== undefined || r.max !== undefined);
}

const NumericRangeFilterPopover = ({ columnKey, label, range, onChange }: Props) => {
  const active = isActive(range);
  const min = range?.min;
  const max = range?.max;

  const update = (patch: Partial<NumericRange>) => {
    const next: NumericRange = { min, max, ...patch };
    if (next.min === undefined && next.max === undefined) {
      onChange(columnKey, null);
    } else {
      onChange(columnKey, next);
    }
  };

  const parse = (raw: string): number | undefined => {
    if (raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`ml-0.5 p-0.5 rounded hover:bg-muted transition-colors ${
            active ? "text-primary" : "text-muted-foreground opacity-50 hover:opacity-100"
          }`}
          title={`Filter ${label}`}
        >
          <Filter className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground">Filter {label}</span>
          {active && (
            <button
              onClick={() => onChange(columnKey, null)}
              className="text-[10px] text-destructive hover:underline flex items-center gap-0.5"
            >
              <X className="h-2.5 w-2.5" /> Clear
            </button>
          )}
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Min (≥)</label>
            <Input
              type="number"
              inputMode="decimal"
              value={min ?? ""}
              onChange={(e) => update({ min: parse(e.target.value) })}
              className="h-7 text-xs"
              placeholder="—"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Max (≤)</label>
            <Input
              type="number"
              inputMode="decimal"
              value={max ?? ""}
              onChange={(e) => update({ max: parse(e.target.value) })}
              className="h-7 text-xs"
              placeholder="—"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NumericRangeFilterPopover;
