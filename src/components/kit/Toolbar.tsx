import type { ReactNode } from "react";
import { Download, Search, X } from "lucide-react";
import "./kit.css";

export interface ActiveChip { key: string; label: string; onRemove: () => void }

/** One row: search, Filter, Sort, download (far right). Active filters below as mint chips. */
export function Toolbar({ search, onSearch, placeholder = "Search", filter, sort, onDownload, downloadLabel = "Download", chips = [], onClear }: {
  search: string; onSearch: (v: string) => void; placeholder?: string;
  filter?: ReactNode; sort?: ReactNode; onDownload?: () => void; downloadLabel?: string;
  chips?: ActiveChip[]; onClear?: () => void;
}) {
  return (
    <div className="kit space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="kit-search">
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
          {search && <button type="button" onClick={() => onSearch("")} aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
        </label>
        {filter}
        {sort}
        {onDownload && (
          <button type="button" className="kit-btn kit-btn-secondary kit-btn-icon ml-auto" onClick={onDownload} aria-label={downloadLabel} title={downloadLabel}>
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button key={c.key} type="button" className="kit-chip" onClick={c.onRemove} aria-label={`Remove filter ${c.label}`}>
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
          {onClear && <button type="button" className="kit-link ml-1" onClick={onClear}>Clear filters</button>}
        </div>
      )}
    </div>
  );
}
