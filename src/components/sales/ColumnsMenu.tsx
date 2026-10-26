import { Check, Columns3, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function ColumnsMenu({ selected, onToggle }: { selected: ExtraColumn[]; onToggle: (key: ExtraColumn) => void }) {
  return <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" className="kit kit-btn kit-btn-secondary" aria-label="Columns">
        <Columns3 /> Columns <ChevronDown />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="kit kit-pop w-64 p-1.5" role="menu" aria-label="Visible columns">
      {EXTRA_COLUMNS.map((column) => <Button key={column.key} variant="ghost" role="menuitemcheckbox"
        aria-checked={selected.includes(column.key)} className="kit-sort-row sales-column-choice" onClick={() => onToggle(column.key)}>
        {column.label}{selected.includes(column.key) && <Check className="h-4 w-4" />}
      </Button>)}
    </PopoverContent>
  </Popover>;
}