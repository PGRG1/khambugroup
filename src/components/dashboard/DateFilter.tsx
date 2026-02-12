import { useState } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ChevronDown } from "lucide-react";

interface DateFilterProps {
  from: Date | undefined;
  to: Date | undefined;
  onFromChange: (d: Date | undefined) => void;
  onToChange: (d: Date | undefined) => void;
  months: string[];
  onPeriodSelect: (period: string) => void;
}

const DateFilter = ({ from, to, onFromChange, onToChange, months, onPeriodSelect }: DateFilterProps) => {
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("All Time");
  const [showCustom, setShowCustom] = useState(false);

  const options = ["All Time", ...months, "Custom"];

  const handleSelect = (option: string) => {
    setSelectedPeriod(option);
    setDropdownOpen(false);
    if (option === "Custom") {
      setShowCustom(true);
      onFromChange(undefined);
      onToChange(undefined);
    } else {
      setShowCustom(false);
      onPeriodSelect(option);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors min-w-[160px] justify-between"
        >
          {selectedPeriod}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
            {options.map((option) => (
              <button
                key={option}
                onClick={() => handleSelect(option)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors ${
                  selectedPeriod === option ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      {showCustom && (
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
      )}
    </div>
  );
};

export default DateFilter;
