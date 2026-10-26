import { Check, Columns3, ChevronDown, ChevronUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const EXTRA_COLUMNS = [
  { key: "orders", label: "Orders", width: 90 },
  { key: "subtotal", label: "Food & drink", width: 140 },
  { key: "serviceCharge", label: "Service charge", width: 140 },
  { key: "discount", label: "Discounts", width: 120 },
  { key: "reportNumber", label: "Report #", width: 120 },
  { key: "servicePeriod", label: "Service period", width: 150 },
  { key: "cards", label: "Cards total", width: 140 },
  { key: "ewallets", label: "E-wallets total", width: 150 },
  { key: "cash", label: "Cash", width: 120 },
  { key: "delivery", label: "Delivery platforms total", width: 190 },
] as const;
export type ExtraColumn = (typeof EXTRA_COLUMNS)[number]["key"];
/** Columns that can be reordered: the fixed trio plus any optional ones. */
export type OrderColumn = "venue" | "guests" | "sales" | ExtraColumn;
export const BASE_COLUMNS: { key: OrderColumn; label: string }[] = [
  { key: "venue", label: "Venue" }, { key: "guests", label: "Guests" }, { key: "sales", label: "Sales" },
];
export const columnLabel = (k: OrderColumn) => BASE_COLUMNS.find((c) => c.key === k)?.label ?? EXTRA_COLUMNS.find((c) => c.key === k)?.label ?? k;

/** `order` lists the "on" columns in table order; Venue is shown but can't be hidden or moved when only one venue is chosen. */
export function ColumnsMenu({ order, onToggle, onReorder, venueLocked }: {
  order: OrderColumn[]; onToggle: (key: ExtraColumn) => void; onReorder: (next: OrderColumn[]) => void; venueLocked?: boolean;
}) {
  const shown = order.filter((k) => !(venueLocked && k === "venue"));
  const shift = (k: OrderColumn, dir: -1 | 1) => {
    const i = shown.indexOf(k), j = i + dir;
    if (i < 0 || j < 0 || j >= shown.length) return;
    const nextShown = [...shown];
    [nextShown[i], nextShown[j]] = [nextShown[j], nextShown[i]];
    onReorder(venueLocked && order.includes("venue") ? ["venue", ...nextShown] : nextShown);
  };
  const off = EXTRA_COLUMNS.filter((c) => !order.includes(c.key));
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="kit kit-btn kit-tool-btn" aria-label="Columns">
        <Columns3 /> Columns <ChevronDown />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="kit kit-pop kit-menu-panel w-64 max-h-[70vh] overflow-y-auto" role="menu" aria-label="Visible columns">
          {shown.map((k, i) => {
            const extra = EXTRA_COLUMNS.find((c) => c.key === k);
            const label = columnLabel(k);
            return (
              <div key={k} className={`kit-sort-row${extra ? " cursor-pointer" : ""}`} role="menuitemcheckbox" aria-checked="true"
                onClick={(e) => { if (extra && !(e.target as HTMLElement).closest(".kit-shift")) onToggle(extra.key); }}>
                <span className="kit-shift-pair">
                  <button type="button" className="kit-shift" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => shift(k, -1)}><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button type="button" className="kit-shift" aria-label={`Move ${label} down`} disabled={i === shown.length - 1} onClick={() => shift(k, 1)}><ChevronDown className="h-3.5 w-3.5" /></button>
                </span>
                <span className="kit-row-label">{label}</span>
                <Check className="kit-row-check" />
              </div>
            );
          })}
      {off.length > 0 && <div className="kit-divider my-1.5" />}
      {off.map((c) => (
        <button key={c.key} type="button" role="menuitemcheckbox" aria-checked={false} className="kit-sort-row" onClick={() => onToggle(c.key)}>
          <span className="w-4" aria-hidden />
          <span className="kit-row-label">{c.label}</span>
        </button>
      ))}
    </PopoverContent>
  </Popover>;
}
