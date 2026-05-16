import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Search, Filter, Columns3, ArrowDownUp, Check,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
 * Pagination
 * ============================================================ */
export const PAGE_SIZE_ALL = 0;

export function usePagination<T>(items: T[], initialPageSize = 25) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(initialPageSize);
  React.useEffect(() => { setPage(1); }, [items.length, pageSize]);

  const effectiveSize = pageSize <= 0 ? Math.max(items.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(items.length / effectiveSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * effectiveSize;
  const pageItems = items.slice(pageStart, pageStart + effectiveSize);
  const rangeStart = items.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(items.length, pageStart + effectiveSize);

  return {
    page: currentPage, pageSize, setPage, setPageSize,
    pageItems, totalPages, rangeStart, rangeEnd, total: items.length,
  };
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (currentPage > 3) pages.push("...");
  const s = Math.max(2, currentPage - 1);
  const e = Math.min(totalPages - 1, currentPage + 1);
  for (let i = s; i <= e; i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push("...");
  pages.push(totalPages);
  return pages;
}

export interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: Array<number | "all">;
}

export function DataTablePagination({
  page, pageSize, totalPages, rangeStart, rangeEnd, total,
  onPageChange, onPageSizeChange, pageSizeOptions = [10, 25, 50, 100],
}: DataTablePaginationProps) {
  const currentValue = pageSize <= 0 ? "all" : String(pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/50 flex-wrap">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page:</span>
        <Select value={currentValue} onValueChange={(v) => onPageSizeChange(v === "all" ? 0 : Number(v))}>
          <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((n) => (
              <SelectItem key={String(n)} value={n === "all" ? "all" : String(n)}>{n === "all" ? "All" : n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="td-num">
          {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()}
        </span>
        <div className="flex items-center gap-1 ml-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => onPageChange(1)}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {getPageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`e-${i}`} className="px-2 text-muted-foreground">…</span>
            ) : (
              <Button key={p} variant={p === page ? "default" : "ghost"} size="icon" className="h-8 w-8 td-num" onClick={() => onPageChange(p as number)}>
                {p}
              </Button>
            ),
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => onPageChange(totalPages)}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Search box
 * ============================================================ */
export function DataTableSearch({
  value, onChange, placeholder = "Search…", className,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 h-9 bg-background/40"
      />
    </div>
  );
}

/* ============================================================
 * Filters popover (generic field-driven)
 * ============================================================ */
export type FilterField =
  | { type: "select"; key: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; allLabel?: string }
  | { type: "date"; key: string; label: string; value: string; onChange: (v: string) => void };

export function DataTableFilters({
  fields, onReset,
}: { fields: FilterField[]; onReset: () => void }) {
  const activeCount = fields.reduce((acc, f) => {
    if (f.type === "select") return acc + (f.value && f.value !== "all" ? 1 : 0);
    if (f.type === "date") return acc + (f.value ? 1 : 0);
    return acc;
  }, 0);

  // Pair date fields together (from/to)
  const rendered: React.ReactNode[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.type === "date" && fields[i + 1]?.type === "date") {
      const next = fields[i + 1] as Extract<FilterField, { type: "date" }>;
      rendered.push(
        <div key={f.key} className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{f.label}</label>
            <Input type="date" value={f.value} onChange={(e) => f.onChange(e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{next.label}</label>
            <Input type="date" value={next.value} onChange={(e) => next.onChange(e.target.value)} className="h-8" />
          </div>
        </div>,
      );
      i++;
      continue;
    }
    if (f.type === "select") {
      rendered.push(
        <div key={f.key} className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{f.label}</label>
          <Select value={f.value || "all"} onValueChange={f.onChange}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{f.allLabel || `All ${f.label}`}</SelectItem>
              {f.options.filter(o => o.value && o.value.trim() !== "").map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>,
      );
    } else {
      rendered.push(
        <div key={f.key} className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{f.label}</label>
          <Input type="date" value={f.value} onChange={(e) => f.onChange(e.target.value)} className="h-8" />
        </div>,
      );
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <Filter className="h-3.5 w-3.5" /> Filters
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center text-[10px] font-medium bg-primary/20 text-primary rounded px-1.5 min-w-[16px] h-4">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        {rendered}
        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onReset} disabled={activeCount === 0}>
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
 * Columns visibility dropdown
 * ============================================================ */
export interface ColumnDef {
  key: string;
  label: string;
  alwaysVisible?: boolean;
}

export function DataTableColumns({
  columns, visible, onToggle,
}: {
  columns: ColumnDef[];
  visible: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <Columns3 className="h-3.5 w-3.5" /> Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.key}
            checked={c.alwaysVisible ? true : !!visible[c.key]}
            disabled={c.alwaysVisible}
            onCheckedChange={(v) => onToggle(c.key, !!v)}
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ============================================================
 * Sort dropdown
 * ============================================================ */
export interface SortOption { key: string; label: string }

export function DataTableSort({
  options, sortKey, sortDir, onChange,
}: {
  options: SortOption[];
  sortKey: string;
  sortDir: "asc" | "desc";
  onChange: (key: string, dir: "asc" | "desc") => void;
}) {
  const current = options.find(o => o.key === sortKey)?.label ?? sortKey;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <ArrowDownUp className="h-3.5 w-3.5" /> {current} ({sortDir === "asc" ? "↑" : "↓"})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem key={o.key} onClick={() => onChange(o.key, sortKey === o.key && sortDir === "asc" ? "desc" : "asc")}>
            {sortKey === o.key && <Check className="h-3.5 w-3.5 mr-2" />}
            <span className={sortKey === o.key ? "" : "ml-[22px]"}>{o.label}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange(sortKey, "asc")}>
          {sortDir === "asc" && <Check className="h-3.5 w-3.5 mr-2" />}
          <span className={sortDir === "asc" ? "" : "ml-[22px]"}>Ascending</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange(sortKey, "desc")}>
          {sortDir === "desc" && <Check className="h-3.5 w-3.5 mr-2" />}
          <span className={sortDir === "desc" ? "" : "ml-[22px]"}>Descending</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ============================================================
 * Shell — composes everything
 * ============================================================ */
export interface DataTableShellProps {
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  /** Slots rendered next to the search box (e.g. status Select). */
  toolbarLeft?: React.ReactNode;
  filters?: { fields: FilterField[]; onReset: () => void };
  /** Result count text shown next to the filters. */
  resultCount?: React.ReactNode;
  /** Slots rendered at the right of the action toolbar (e.g. Download, Add buttons). */
  toolbarRight?: React.ReactNode;
  columns?: { items: ColumnDef[]; visible: Record<string, boolean>; onToggle: (key: string, v: boolean) => void };
  sort?: { options: SortOption[]; sortKey: string; sortDir: "asc" | "desc"; onChange: (key: string, dir: "asc" | "desc") => void };
  pagination?: DataTablePaginationProps;
  children: React.ReactNode;
  /** Extra className for the inner overflow container. */
  bodyClassName?: string;
}

export function DataTableShell({
  search, toolbarLeft, filters, resultCount, toolbarRight,
  columns, sort, pagination, children, bodyClassName,
}: DataTableShellProps) {
  return (
    <div className="space-y-3">
      {(search || toolbarRight) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <DataTableSearch
              value={search.value}
              onChange={search.onChange}
              placeholder={search.placeholder}
              className="flex-1 min-w-[240px] max-w-md"
            />
          )}
          {toolbarRight && <div className="ml-auto flex items-center gap-2">{toolbarRight}</div>}
        </div>
      )}

      {(toolbarLeft || filters || columns || sort || resultCount) && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {toolbarLeft}
            {filters && <DataTableFilters fields={filters.fields} onReset={filters.onReset} />}
            {resultCount && <span className="text-xs text-muted-foreground ml-1">{resultCount}</span>}
          </div>
          <div className="flex items-center gap-2">
            {columns && <DataTableColumns columns={columns.items} visible={columns.visible} onToggle={columns.onToggle} />}
            {sort && <DataTableSort options={sort.options} sortKey={sort.sortKey} sortDir={sort.sortDir} onChange={sort.onChange} />}
          </div>
        </div>
      )}

      <Card className="card-glass overflow-hidden">
        <div className={cn("overflow-x-auto", bodyClassName)}>
          {children}
        </div>
        {pagination && <DataTablePagination {...pagination} />}
      </Card>
    </div>
  );
}
