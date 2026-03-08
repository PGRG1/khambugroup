import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  startTime: string; // "HH:MM"
  endTime: string;
  onChangeStart: (time: string) => void;
  onChangeEnd: (time: string) => void;
}

// 30-min slots from 6AM to 10AM next day = 56 slots (28h)
const SLOTS: { hour: number; minute: number; label: string }[] = [];
for (let h = 6; h < 24; h++) {
  SLOTS.push({ hour: h, minute: 0, label: formatLabel(h) });
  SLOTS.push({ hour: h, minute: 30, label: "" });
}
for (let h = 0; h < 10; h++) {
  SLOTS.push({ hour: h + 24, minute: 0, label: formatLabel(h) });
  SLOTS.push({ hour: h + 24, minute: 30, label: "" });
}

function formatLabel(h: number): string {
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
    const last = SLOTS[SLOTS.length - 1];
    const totalMin = last.hour * 60 + last.minute + 30;
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const slot = SLOTS[Math.max(0, Math.min(SLOTS.length - 1, index))];
  const h = slot.hour % 24;
  return `${String(h).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
}

function formatDisplay(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 6; h < 24; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const suffix = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = m === 0 ? `${h12}:00 ${suffix}` : `${h12}:30 ${suffix}`;
      options.push({ value, label });
    }
  }
  for (let h = 0; h < 10; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const suffix = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = m === 0 ? `${h12}:00 ${suffix} +1` : `${h12}:30 ${suffix} +1`;
      options.push({ value, label });
    }
  }
  return options;
}

const SLOT_HEIGHT = 18;
const LABEL_WIDTH = 48;
const timeOptions = generateTimeOptions();

export function TimeGridPicker({ startTime, endTime, onChangeStart, onChangeEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const anchorRef = useRef<number | null>(null);
  const currentRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const startIdx = toSlotIndex(startTime);
  const endIdx = toSlotIndex(endTime);

  // Committed selection (not dragging)
  const selStart = startIdx;
  const selEnd = Math.max(startIdx, endIdx - 1);

  const getSlotFromY = useCallback((clientY: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const y = clientY - rect.top + containerRef.current.scrollTop;
    return Math.max(0, Math.min(SLOTS.length - 1, Math.floor(y / SLOT_HEIGHT)));
  }, []);

  // Paint overlay directly via DOM (no React state during drag)
  const paintOverlay = useCallback(() => {
    if (!overlayRef.current) return;
    const anchor = anchorRef.current;
    const cur = currentRef.current;
    if (anchor === null || cur === null) {
      // Show committed selection
      const top = selStart * SLOT_HEIGHT;
      const height = (selEnd - selStart + 1) * SLOT_HEIGHT;
      overlayRef.current.style.top = `${top}px`;
      overlayRef.current.style.height = `${height}px`;
      overlayRef.current.style.opacity = "1";
      return;
    }
    const minI = Math.min(anchor, cur);
    const maxI = Math.max(anchor, cur);
    const top = minI * SLOT_HEIGHT;
    const height = (maxI - minI + 1) * SLOT_HEIGHT;
    overlayRef.current.style.top = `${top}px`;
    overlayRef.current.style.height = `${height}px`;
    overlayRef.current.style.opacity = "1";
  }, [selStart, selEnd]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const idx = getSlotFromY(e.clientY);
    draggingRef.current = true;
    anchorRef.current = idx;
    currentRef.current = idx;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    paintOverlay();
  }, [getSlotFromY, paintOverlay]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const idx = getSlotFromY(e.clientY);
    if (idx === currentRef.current) return; // no change
    currentRef.current = idx;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(paintOverlay);
  }, [getSlotFromY, paintOverlay]);

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const anchor = anchorRef.current;
    const cur = currentRef.current;
    if (anchor !== null && cur !== null) {
      const minI = Math.min(anchor, cur);
      const maxI = Math.max(anchor, cur) + 1;
      onChangeStart(fromSlotIndex(minI));
      onChangeEnd(fromSlotIndex(maxI, true));
    }
    anchorRef.current = null;
    currentRef.current = null;
  }, [onChangeStart, onChangeEnd]);

  // Sync overlay when committed selection changes
  useEffect(() => {
    paintOverlay();
  }, [selStart, selEnd, paintOverlay]);

  // Auto-scroll on mount
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = Math.max(0, (startIdx - 2) * SLOT_HEIGHT);
    }
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* Header: dropdowns + summary */}
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5 block">Start</label>
          <select
            value={startTime}
            onChange={(e) => onChangeStart(e.target.value)}
            className="w-full h-7 rounded-md border border-border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {timeOptions.map(opt => (
              <option key={`s-${opt.value}`} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <span className="text-muted-foreground text-xs pb-1">–</span>
        <div className="flex-1 min-w-0">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5 block">End</label>
          <select
            value={endTime}
            onChange={(e) => onChangeEnd(e.target.value)}
            className="w-full h-7 rounded-md border border-border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {timeOptions.map(opt => (
              <option key={`e-${opt.value}`} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="text-[11px] font-medium text-primary whitespace-nowrap pb-1 pl-1">
          {formatDisplay(startTime)} – {formatDisplay(endTime)}
        </div>
      </div>

      {/* Time grid */}
      <div
        ref={containerRef}
        className="relative border border-border rounded-lg overflow-y-auto select-none cursor-cell"
        style={{ height: 420, touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div style={{ height: SLOTS.length * SLOT_HEIGHT, position: "relative" }}>
          {/* Hour lines + labels */}
          {SLOTS.map((slot, i) => {
            const isHour = slot.minute === 0;
            return (
              <div
                key={i}
                className={`absolute left-0 right-0 ${
                  isHour ? "border-t border-border/60" : "border-t border-border/15"
                }`}
                style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
              >
                {isHour && (
                  <span
                    className="absolute text-[10px] text-muted-foreground leading-none pointer-events-none"
                    style={{ left: 6, top: 2, width: LABEL_WIDTH - 10 }}
                  >
                    {slot.label}
                  </span>
                )}
              </div>
            );
          })}

          {/* Selection overlay — single div, painted via ref */}
          <div
            ref={overlayRef}
            className="absolute rounded-md pointer-events-none"
            style={{
              left: LABEL_WIDTH,
              right: 4,
              top: selStart * SLOT_HEIGHT,
              height: (selEnd - selStart + 1) * SLOT_HEIGHT,
              background: "hsl(var(--primary) / 0.2)",
              borderTop: "2px solid hsl(var(--primary))",
              borderBottom: "2px solid hsl(var(--primary))",
              willChange: "top, height",
              transition: draggingRef.current ? "none" : "top 80ms ease-out, height 80ms ease-out",
            }}
          />
        </div>
      </div>
    </div>
  );
}
