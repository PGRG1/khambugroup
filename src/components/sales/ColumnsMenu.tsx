import { Check, Columns3, ChevronDown, GripVertical } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

function SortableRow({ id, label, disabled }: { id: OrderColumn; label: string; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : undefined, position: "relative" }}
      className="kit-sort-row" aria-selected="true" role="menuitemcheckbox" aria-checked="true">
      <button type="button" className="kit-drag" aria-label={`Move ${label}`} disabled={disabled} {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="kit-row-label">{label}</span>
      <Check className="kit-row-check" />
    </div>
  );
}

/** `order` lists the "on" columns in table order; Venue is shown but can't be hidden or moved when only one venue is chosen. */
export function ColumnsMenu({ order, onToggle, onReorder, venueLocked }: {
  order: OrderColumn[]; onToggle: (key: ExtraColumn) => void; onReorder: (next: OrderColumn[]) => void; venueLocked?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const shown = order.filter((k) => !(venueLocked && k === "venue"));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.indexOf(e.active.id as OrderColumn), to = order.indexOf(e.over.id as OrderColumn);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(order, from, to));
  };
  const off = EXTRA_COLUMNS.filter((c) => !order.includes(c.key));
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="kit kit-btn kit-tool-btn" aria-label="Columns">
        <Columns3 /> Columns <ChevronDown />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="kit kit-pop kit-menu-panel w-64 max-h-[70vh] overflow-y-auto" role="menu" aria-label="Visible columns">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          {shown.map((k) => {
            const extra = EXTRA_COLUMNS.find((c) => c.key === k);
            return extra
              ? <div key={k} onClick={(e) => { if (!(e.target as HTMLElement).closest(".kit-drag")) onToggle(extra.key); }} className="cursor-pointer"><SortableRow id={k} label={extra.label} /></div>
              : <SortableRow key={k} id={k} label={columnLabel(k)} />;
          })}
        </SortableContext>
      </DndContext>
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
