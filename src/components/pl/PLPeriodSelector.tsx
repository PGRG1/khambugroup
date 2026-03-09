import { useState, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export type ViewMode = "monthly" | "quarterly" | "semi-annual" | "annual";

export interface PeriodOption {
  id: string;
  label: string;
  months: number[];
  year: number;
}

function getOptionsForView(view: ViewMode, year: number): PeriodOption[] {
  switch (view) {
    case "monthly":
      return MONTHS.map((m, i) => ({
        id: `${year}-${i + 1}`,
        label: `${m} ${year}`,
        months: [i + 1],
        year,
      }));
    case "quarterly":
      return [
        { id: `${year}-Q1`, label: `Q1 ${year}`, months: [1, 2, 3], year },
        { id: `${year}-Q2`, label: `Q2 ${year}`, months: [4, 5, 6], year },
        { id: `${year}-Q3`, label: `Q3 ${year}`, months: [7, 8, 9], year },
        { id: `${year}-Q4`, label: `Q4 ${year}`, months: [10, 11, 12], year },
      ];
    case "semi-annual":
      return [
        { id: `${year}-H1`, label: `H1 ${year}`, months: [1, 2, 3, 4, 5, 6], year },
        { id: `${year}-H2`, label: `H2 ${year}`, months: [7, 8, 9, 10, 11, 12], year },
      ];
    case "annual":
      return [{ id: `${year}`, label: `${year}`, months: Array.from({ length: 12 }, (_, i) => i + 1), year }];
  }
}

interface Props {
  viewMode: ViewMode;
  selectedPeriods: PeriodOption[];
  onViewModeChange: (v: ViewMode) => void;
  onPeriodsChange: (periods: PeriodOption[]) => void;
}

export function PLPeriodSelector({ viewMode, selectedPeriods, onViewModeChange, onPeriodsChange }: Props) {
  const [open, setOpen] = useState(false);

  // --- Drag-to-select state ---
  const isDragging = useRef(false);
  const dragMode = useRef<"add" | "remove">("add");
  const dragTouched = useRef(new Set<string>());
  const startSnapshot = useRef<PeriodOption[]>([]);

  const allOptions = useMemo(() => {
    return YEAR_OPTIONS.flatMap(y => getOptionsForView(viewMode, y));
  }, [viewMode]);

  const allOptionsMap = useMemo(() => {
    const map = new Map<string, PeriodOption>();
    allOptions.forEach(o => map.set(o.id, o));
    return map;
  }, [allOptions]);

  const selectedIds = new Set(selectedPeriods.map(p => p.id));

  const sortPeriods = useCallback((periods: PeriodOption[]) => {
    return [...periods].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.months[0] - b.months[0];
    });
  }, []);

  const applyDrag = useCallback(() => {
    const snapshot = startSnapshot.current;
    const touched = dragTouched.current;
    const mode = dragMode.current;

    let result: PeriodOption[];
    if (mode === "add") {
      const existing = new Set(snapshot.map(p => p.id));
      const toAdd = [...touched].filter(id => !existing.has(id)).map(id => allOptionsMap.get(id)!).filter(Boolean);
      result = [...snapshot, ...toAdd];
    } else {
      result = snapshot.filter(p => !touched.has(p.id));
    }
    onPeriodsChange(sortPeriods(result));
  }, [allOptionsMap, onPeriodsChange, sortPeriods]);

  const handlePointerDown = useCallback((opt: PeriodOption) => {
    isDragging.current = true;
    dragTouched.current = new Set([opt.id]);
    startSnapshot.current = [...selectedPeriods];
    // If currently selected → we're removing; otherwise adding
    dragMode.current = selectedIds.has(opt.id) ? "remove" : "add";
    applyDrag();
  }, [selectedPeriods, selectedIds, applyDrag]);

  const handlePointerEnter = useCallback((opt: PeriodOption) => {
    if (!isDragging.current) return;
    dragTouched.current.add(opt.id);
    applyDrag();
  }, [applyDrag]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    dragTouched.current.clear();
  }, []);

  const removePeriod = (id: string) => {
    onPeriodsChange(selectedPeriods.filter(p => p.id !== id));
  };

  const handleViewModeChange = (v: string) => {
    const newMode = v as ViewMode;
    onViewModeChange(newMode);
    const now = new Date();
    const opts = getOptionsForView(newMode, now.getFullYear());
    const currentMonth = now.getMonth() + 1;
    let defaultOpt: PeriodOption;
    if (newMode === "monthly") {
      defaultOpt = opts.find(o => o.months[0] === currentMonth)!;
    } else if (newMode === "quarterly") {
      defaultOpt = opts.find(o => o.months.includes(currentMonth))!;
    } else if (newMode === "semi-annual") {
      defaultOpt = opts.find(o => o.months.includes(currentMonth))!;
    } else {
      defaultOpt = opts[0];
    }
    onPeriodsChange([defaultOpt]);
  };

  const optionsByYear = useMemo(() => {
    const map = new Map<number, PeriodOption[]>();
    for (const opt of allOptions) {
      if (!map.has(opt.year)) map.set(opt.year, []);
      map.get(opt.year)!.push(opt);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [allOptions]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={viewMode} onValueChange={handleViewModeChange}>
        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="monthly">Monthly</SelectItem>
          <SelectItem value="quarterly">Quarterly</SelectItem>
          <SelectItem value="semi-annual">Semi-Annual</SelectItem>
          <SelectItem value="annual">Annual</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-auto min-h-9 py-1.5 px-3 flex items-center gap-2 max-w-[500px]">
            {selectedPeriods.length === 0 ? (
              <span className="text-muted-foreground text-sm">Select periods…</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {selectedPeriods.map(p => (
                  <Badge key={p.id} variant="secondary" className="text-xs font-medium gap-1 pr-1">
                    {p.label}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); removePeriod(p.id); }}
                    />
                  </Badge>
                ))}
              </div>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-3 max-h-[340px] overflow-y-auto select-none"
          align="start"
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div className="space-y-3">
            {optionsByYear.map(([year, opts]) => (
              <div key={year}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{year}</p>
                <div className="flex flex-wrap gap-1.5">
                  {opts.map(opt => {
                    const isSelected = selectedIds.has(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          handlePointerDown(opt);
                        }}
                        onPointerEnter={() => handlePointerEnter(opt)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border touch-none ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card hover:bg-secondary border-border text-foreground/70 hover:text-foreground"
                        }`}
                      >
                        {opt.label.replace(` ${year}`, "")}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function getDefaultPeriod(viewMode: ViewMode): PeriodOption[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const opts = getOptionsForView(viewMode, year);
  if (viewMode === "monthly") return [opts.find(o => o.months[0] === month)!];
  if (viewMode === "annual") return [opts[0]];
  return [opts.find(o => o.months.includes(month))!];
}
