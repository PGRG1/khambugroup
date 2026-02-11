import { useState } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";

interface DateFilterProps {
  from: Date | undefined;
  to: Date | undefined;
  onFromChange: (d: Date | undefined) => void;
  onToChange: (d: Date | undefined) => void;
  months: string[];
  onMonthSelect: (month: string) => void;
}

const DateFilter = ({ from, to, onFromChange, onToChange, months, onMonthSelect }: DateFilterProps) => {
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 rounded-lg border border-border overflow-hidden">
        {months.map((m) => (
          <button
            key={m}
            onClick={() => onMonthSelect(m)}
            className="px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
          >
            {m}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors">
              <CalendarIcon className="h-3 w-3" />
              {from ? format(from, "MMM d, yyyy") : "From"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={from} onSelect={(d) => { onFromChange(d); setFromOpen(false); }} />
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground text-xs">→</span>
        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors">
              <CalendarIcon className="h-3 w-3" />
              {to ? format(to, "MMM d, yyyy") : "To"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={to} onSelect={(d) => { onToChange(d); setToOpen(false); }} />
          </PopoverContent>
        </Popover>
        {(from || to) && (
          <button
            onClick={() => { onFromChange(undefined); onToChange(undefined); }}
            className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
};

export default DateFilter;
