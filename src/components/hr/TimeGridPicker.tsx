import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  startTime: string; // "HH:MM"
  endTime: string;
  onChangeStart: (time: string) => void;
  onChangeEnd: (time: string) => void;
}

// 30-min slots from 6AM to 6AM (next day) = 48 slots (full 24h)
const SLOTS: { hour: number; minute: number; label: string }[] = [];
for (let h = 6; h < 24; h++) {
  SLOTS.push({ hour: h, minute: 0, label: formatLabel(h, 0) });
  SLOTS.push({ hour: h, minute: 30, label: "" });
}
// 12AM–6AM (next day)
for (let h = 0; h < 6; h++) {
  SLOTS.push({ hour: h + 24, minute: 0, label: formatLabel(h, 0) });
  SLOTS.push({ hour: h + 24, minute: 30, label: "" });
}

function formatLabel(h: number, _m: number): string {
  const hour = h % 24;
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

function toSlotIndex(time: string): number {
  const [h, m] = time.split(":").map(Number);
  const adjustedH = h < 6 ? h + 24 : h;
  const baseIndex = (adjustedH - 6) * 2 + (m >= 30 ? 1 : 0);
  return Math.max(0, Math.min(SLOTS.length - 1, baseIndex));
}

function fromSlotIndex(index: number, isEnd = false): string {
  if (isEnd && index >= SLOTS.length) {
    // Past last slot — return 30 min after last slot
    const last = SLOTS[SLOTS.length - 1];
    const totalMin = (last.hour * 60 + last.minute + 30);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const slot = SLOTS[Math.max(0, Math.min(SLOTS.length - 1, index))];
  const h = slot.hour % 24;
  return `${String(h).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
}

const SLOT_HEIGHT = 20; // px per 30-min slot

export function TimeGridPicker({ startTime, endTime, onChangeStart, onChangeEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragAnchor, setDragAnchor] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);

  const startIdx = toSlotIndex(startTime);
  const endIdx = toSlotIndex(endTime);

  const getSlotFromY = useCallback((clientY: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const y = clientY - rect.top + containerRef.current.scrollTop;
    return Math.max(0, Math.min(SLOTS.length - 1, Math.floor(y / SLOT_HEIGHT)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const idx = getSlotFromY(e.clientY);
    setDragging(true);
    setDragAnchor(idx);
    setDragCurrent(idx);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [getSlotFromY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragCurrent(getSlotFromY(e.clientY));
  }, [dragging, getSlotFromY]);

  const handlePointerUp = useCallback(() => {
    if (!dragging || dragAnchor === null || dragCurrent === null) {
      setDragging(false);
      return;
    }
    const minI = Math.min(dragAnchor, dragCurrent);
    const maxI = Math.max(dragAnchor, dragCurrent) + 1; // end is exclusive (next slot)
    onChangeStart(fromSlotIndex(minI));
    onChangeEnd(fromSlotIndex(maxI, true));
    setDragging(false);
    setDragAnchor(null);
    setDragCurrent(null);
  }, [dragging, dragAnchor, dragCurrent, onChangeStart, onChangeEnd]);

  // Determine highlighted range
  let selStart: number, selEnd: number;
  if (dragging && dragAnchor !== null && dragCurrent !== null) {
    selStart = Math.min(dragAnchor, dragCurrent);
    selEnd = Math.max(dragAnchor, dragCurrent);
  } else {
    selStart = startIdx;
    selEnd = Math.max(startIdx, endIdx - 1);
  }

  // Auto-scroll to selection on mount
  useEffect(() => {
    if (containerRef.current) {
      const scrollTo = Math.max(0, (startIdx - 2) * SLOT_HEIGHT);
      containerRef.current.scrollTop = scrollTo;
    }
  }, []);

  const formatDisplay = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scheduled Time</h4>
        <span className="text-xs text-muted-foreground">
          {formatDisplay(startTime)} – {formatDisplay(endTime)}
        </span>
      </div>
      <div
        ref={containerRef}
        className="relative border border-border rounded-lg overflow-y-auto select-none cursor-crosshair"
        style={{ height: 300, touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div style={{ height: SLOTS.length * SLOT_HEIGHT }} className="relative">
          {SLOTS.map((slot, i) => {
            const isHour = slot.minute === 0;
            const isSelected = i >= selStart && i <= selEnd;
            const isSelStart = i === selStart;
            const isSelEnd = i === selEnd;

            return (
              <div
                key={i}
                className={`absolute left-0 right-0 flex items-start ${
                  isHour ? "border-t border-border/60" : "border-t border-border/20"
                }`}
                style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
              >
                {/* Time label */}
                {isHour && (
                  <span className="text-[10px] text-muted-foreground w-14 shrink-0 pl-2 -mt-0.5 leading-none pointer-events-none">
                    {slot.label}
                  </span>
                )}
                {!isHour && <span className="w-14 shrink-0" />}

                {/* Selection block */}
                <div className="flex-1 h-full relative">
                  {isSelected && (
                    <div
                      className={`absolute inset-0 bg-primary/25 ${
                        isSelStart ? "rounded-t-md" : ""
                      } ${isSelEnd ? "rounded-b-md" : ""}`}
                    >
                      {isSelStart && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                      )}
                      {isSelEnd && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
