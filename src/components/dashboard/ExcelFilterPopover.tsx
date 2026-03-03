import { useState, useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Filter, Search, X, ChevronRight, ChevronDown } from "lucide-react";

interface ExcelFilterProps {
  columnKey: string;
  label: string;
  values: string[];
  selectedValues: Set<string> | null;
  onFilterChange: (col: string, values: Set<string> | null) => void;
  isDate?: boolean;
}

interface DateNode {
  year: string;
  months: { month: string; monthName: string; days: string[] }[];
}

const MONTH_NAMES: Record<string, string> = {
  "01": "January", "02": "February", "03": "March", "04": "April",
  "05": "May", "06": "June", "07": "July", "08": "August",
  "09": "September", "10": "October", "11": "November", "12": "December",
};

const parseDateParts = (date: string): { year: string; month: string; day: string } | null => {
  if (date.includes("-")) {
    const parts = date.split("-");
    if (parts.length >= 3) return { year: parts[0], month: parts[1], day: parts[2] };
  } else if (date.includes("/")) {
    const parts = date.split("/");
    if (parts.length >= 3) {
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return { year, month: parts[1], day: parts[0] };
    }
  }
  return null;
};

const ExcelFilterPopover = ({ columnKey, label, values, selectedValues, onFilterChange, isDate }: ExcelFilterProps) => {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const hasFilter = selectedValues !== null;

  // For date columns, build a Year → Month → Day tree
  const dateTree = useMemo<DateNode[]>(() => {
    if (!isDate) return [];
    const tree: Record<string, Record<string, Set<string>>> = {};
    values.forEach(date => {
      const parsed = parseDateParts(date);
      if (parsed) {
        if (!tree[parsed.year]) tree[parsed.year] = {};
        if (!tree[parsed.year][parsed.month]) tree[parsed.year][parsed.month] = new Set();
        tree[parsed.year][parsed.month].add(date);
      }
    });
    return Object.entries(tree)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, months]) => ({
        year,
        months: Object.entries(months)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, days]) => ({
            month,
            monthName: MONTH_NAMES[month] || month,
            days: Array.from(days).sort(),
          })),
      }));
  }, [values, isDate]);

  const filteredValues = useMemo(() => {
    if (!search.trim()) return values;
    const q = search.toLowerCase();
    return values.filter(v => v.toLowerCase().includes(q));
  }, [values, search]);

  const filteredDateTree = useMemo<DateNode[]>(() => {
    if (!isDate || !search.trim()) return dateTree;
    const q = search.toLowerCase();
    return dateTree
      .map(node => ({
        ...node,
        months: node.months
          .map(m => ({
            ...m,
            days: m.days.filter(d => d.toLowerCase().includes(q) || m.monthName.toLowerCase().includes(q) || node.year.includes(q)),
          }))
          .filter(m => m.days.length > 0),
      }))
      .filter(n => n.months.length > 0);
  }, [dateTree, search, isDate]);

  // Determine "all visible" state
  const allValues = isDate ? values : filteredValues;
  const isAllSelected = !hasFilter; // no filter = everything shown
  const isSomeSelected = hasFilter && selectedValues!.size > 0 && selectedValues!.size < allValues.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      // Deselect all → empty set (show nothing)
      onFilterChange(columnKey, new Set());
    } else {
      // Select all → clear filter
      onFilterChange(columnKey, null);
    }
  };

  const toggleValue = (val: string) => {
    const current = selectedValues ? new Set(selectedValues) : new Set(allValues);
    if (current.has(val)) {
      current.delete(val);
    } else {
      current.add(val);
    }
    // If all selected, clear filter
    if (current.size === allValues.length) {
      onFilterChange(columnKey, null);
    } else if (current.size === 0) {
      onFilterChange(columnKey, new Set());
    } else {
      onFilterChange(columnKey, current);
    }
  };

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Date group helpers
  const getDatesForYear = (year: string) => {
    const node = dateTree.find(n => n.year === year);
    return node ? node.months.flatMap(m => m.days) : [];
  };

  const getDatesForMonth = (year: string, month: string) => {
    const node = dateTree.find(n => n.year === year);
    const m = node?.months.find(m => m.month === month);
    return m ? m.days : [];
  };

  const isGroupChecked = (dates: string[]) => {
    if (!hasFilter) return true;
    return dates.every(d => selectedValues!.has(d));
  };

  const isGroupIndeterminate = (dates: string[]) => {
    if (!hasFilter) return false;
    const count = dates.filter(d => selectedValues!.has(d)).length;
    return count > 0 && count < dates.length;
  };

  const toggleGroup = (dates: string[]) => {
    const current = selectedValues ? new Set(selectedValues) : new Set(allValues);
    const allChecked = dates.every(d => current.has(d));
    dates.forEach(d => {
      if (allChecked) current.delete(d); else current.add(d);
    });
    if (current.size === allValues.length) {
      onFilterChange(columnKey, null);
    } else if (current.size === 0) {
      onFilterChange(columnKey, new Set());
    } else {
      onFilterChange(columnKey, current);
    }
  };

  const isValueChecked = (val: string) => {
    if (!hasFilter) return true;
    return selectedValues!.has(val);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`ml-0.5 p-0.5 rounded hover:bg-muted transition-colors ${hasFilter ? "text-primary" : "text-muted-foreground opacity-50 hover:opacity-100"}`}>
          <Filter className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
          <span className="text-xs font-semibold text-foreground">Filter {label}</span>
          {hasFilter && (
            <button onClick={() => onFilterChange(columnKey, null)} className="text-[10px] text-destructive hover:underline flex items-center gap-0.5">
              <X className="h-2.5 w-2.5" /> Clear
            </button>
          )}
        </div>

        {/* Search */}
        <div className="px-2 pb-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-7 h-7 text-xs"
            />
          </div>
        </div>

        {/* Select All */}
        <div className="px-2 border-b border-border pb-1.5">
          <div
            className="flex items-center gap-1.5 text-xs font-medium cursor-pointer hover:bg-muted rounded px-1.5 py-1"
            onClick={toggleSelectAll}
          >
            <Checkbox
              checked={isAllSelected}
              className="h-3.5 w-3.5 pointer-events-none"
              tabIndex={-1}
              // @ts-ignore
              indeterminate={isSomeSelected}
            />
            <span>(Select All)</span>
          </div>
        </div>

        {/* Values list */}
        <div className="max-h-56 overflow-y-auto px-2 py-1.5">
          {isDate ? (
            <div className="space-y-0.5">
              {filteredDateTree.map(({ year, months }) => {
                const yearDates = getDatesForYear(year);
                const yearExpanded = expanded.has(year);
                return (
                  <div key={year}>
                    <div className="flex items-center gap-1 text-xs cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                      <button onClick={() => toggleExpand(year)} className="p-0 shrink-0">
                        {yearExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      </button>
                      <div className="flex items-center gap-1.5 flex-1" onClick={() => toggleGroup(yearDates)}>
                        <Checkbox
                          checked={isGroupChecked(yearDates)}
                          className="h-3.5 w-3.5 pointer-events-none"
                          tabIndex={-1}
                        />
                        <span className="font-medium">{year}</span>
                      </div>
                    </div>
                    {yearExpanded && (
                      <div className="ml-3">
                        {months.map(({ month, monthName, days }) => {
                          const monthDates = getDatesForMonth(year, month);
                          const monthKey = `${year}-${month}`;
                          const monthExpanded = expanded.has(monthKey);
                          return (
                            <div key={month}>
                              <div className="flex items-center gap-1 text-xs cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                                <button onClick={() => toggleExpand(monthKey)} className="p-0 shrink-0">
                                  {monthExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                </button>
                                <div className="flex items-center gap-1.5 flex-1" onClick={() => toggleGroup(monthDates)}>
                                  <Checkbox
                                    checked={isGroupChecked(monthDates)}
                                    className="h-3.5 w-3.5 pointer-events-none"
                                    tabIndex={-1}
                                  />
                                  <span>{monthName}</span>
                                </div>
                              </div>
                              {monthExpanded && (
                                <div className="ml-6 space-y-0.5">
                                  {days.map(day => {
                                    const parsed = parseDateParts(day);
                                    const dayLabel = parsed ? parseInt(parsed.day, 10).toString() : day;
                                    return (
                                      <div
                                        key={day}
                                        className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-muted rounded px-1 py-0.5"
                                        onClick={() => toggleValue(day)}
                                      >
                                        <Checkbox
                                          checked={isValueChecked(day)}
                                          className="h-3.5 w-3.5 pointer-events-none"
                                          tabIndex={-1}
                                        />
                                        <span>{dayLabel}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredValues.map(val => (
                <div
                  key={val}
                  className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-muted rounded px-1.5 py-0.5"
                  onClick={() => toggleValue(val)}
                >
                  <Checkbox
                    checked={isValueChecked(val)}
                    className="h-3.5 w-3.5 pointer-events-none"
                    tabIndex={-1}
                  />
                  <span className="truncate">{val}</span>
                </div>
              ))}
              {filteredValues.length === 0 && (
                <span className="text-xs text-muted-foreground px-1.5">No matches</span>
              )}
            </div>
          )}
        </div>

        {/* Footer with count */}
        {hasFilter && (
          <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground">
            {selectedValues!.size} of {allValues.length} selected
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ExcelFilterPopover;
