import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Clock } from "lucide-react";

interface Props {
  startTime: string;
  endTime: string;
  onChangeStart: (time: string) => void;
  onChangeEnd: (time: string) => void;
}

/* ── Slot model ── */
interface Slot { hour: number; minute: number; label: string }

const SLOTS: Slot[] = [];
for (let h = 6; h < 24; h++) {
  SLOTS.push({ hour: h, minute: 0, label: fmtLabel(h) });
  SLOTS.push({ hour: h, minute: 30, label: "" });
}
for (let h = 0; h < 10; h++) {
  SLOTS.push({ hour: h + 24, minute: 0, label: fmtLabel(h) });
  SLOTS.push({ hour: h + 24, minute: 30, label: "" });
}

function fmtLabel(h: number): string {
  const hr = h % 24;
  if (hr === 0) return "12 AM";
  if (hr === 12) return "12 PM";
  return hr > 12 ? `${hr - 12} PM` : `${hr} AM`;
}

function toIdx(time: string): number {
  const [h, m] = time.split(":").map(Number);
  const adj = h < 6 ? h + 24 : h;
  return Math.max(0, Math.min(SLOTS.length - 1, (adj - 6) * 2 + (m >= 30 ? 1 : 0)));
}

function fromIdx(i: number, isEnd = false): string {
  if (isEnd && i >= SLOTS.length) {
    const last = SLOTS[SLOTS.length - 1];
    const tot = last.hour * 60 + last.minute + 30;
    return `${String(Math.floor(tot / 60) % 24).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
  }
  const s = SLOTS[Math.max(0, Math.min(SLOTS.length - 1, i))];
  return `${String(s.hour % 24).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`;
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const sfx = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}:00 ${sfx}` : `${h12}:${String(m).padStart(2, "0")} ${sfx}`;
}

function calcDuration(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const hrs = Math.floor(mins / 60);
  const rm = mins % 60;
  return rm === 0 ? `${hrs}h` : `${hrs}h ${rm}m`;
}

const SLOT_H = 20;
const LABEL_W = 52;

function buildTimeOpts() {
  const o: { value: string; label: string }[] = [];
  for (let h = 6; h < 24; h++) {
    for (const m of [0, 30]) {
      const v = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const sfx = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      o.push({ value: v, label: m === 0 ? `${h12}:00 ${sfx}` : `${h12}:30 ${sfx}` });
    }
  }
  for (let h = 0; h < 10; h++) {
    for (const m of [0, 30]) {
      const v = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const sfx = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      o.push({ value: v, label: m === 0 ? `${h12}:00 ${sfx} +1` : `${h12}:30 ${sfx} +1` });
    }
  }
  return o;
}

const TIME_OPTS = buildTimeOpts();

export function TimeGridPicker({ startTime, endTime, onChangeStart, onChangeEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const anchorRef = useRef<number | null>(null);
  const currentRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  // Live display state (updates during drag for the summary bar)
  const [liveStart, setLiveStart] = useState(startTime);
  const [liveEnd, setLiveEnd] = useState(endTime);

  // Sync live values when props change (e.g. dropdown change)
  useEffect(() => { setLiveStart(startTime); }, [startTime]);
  useEffect(() => { setLiveEnd(endTime); }, [endTime]);

  const startIdx = toIdx(startTime);
  const endIdx = toIdx(endTime);
  const selStart = startIdx;
  const selEnd = Math.max(startIdx, endIdx - 1);

  const yToSlot = useCallback((clientY: number) => {
    if (!containerRef.current) return 0;
    const r = containerRef.current.getBoundingClientRect();
    const y = clientY - r.top + containerRef.current.scrollTop;
    return Math.max(0, Math.min(SLOTS.length - 1, Math.floor(y / SLOT_H)));
  }, []);

  const paintOverlay = useCallback((s: number, e: number) => {
    if (!overlayRef.current) return;
    overlayRef.current.style.top = `${s * SLOT_H}px`;
    overlayRef.current.style.height = `${(e - s + 1) * SLOT_H}px`;
  }, []);

  // Paint committed selection
  useEffect(() => {
    if (!draggingRef.current) paintOverlay(selStart, selEnd);
  }, [selStart, selEnd, paintOverlay]);

  const onDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const idx = yToSlot(e.clientY);
    draggingRef.current = true;
    anchorRef.current = idx;
    currentRef.current = idx;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    paintOverlay(idx, idx);
    // Update live display
    const s = fromIdx(idx);
    const eTime = fromIdx(idx + 1, true);
    setLiveStart(s);
    setLiveEnd(eTime);
  }, [yToSlot, paintOverlay]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const idx = yToSlot(e.clientY);
    if (idx === currentRef.current) return;
    currentRef.current = idx;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const a = anchorRef.current!;
      const minI = Math.min(a, idx);
      const maxI = Math.max(a, idx);
      paintOverlay(minI, maxI);
      // Update live display in real-time
      setLiveStart(fromIdx(minI));
      setLiveEnd(fromIdx(maxI + 1, true));
    });
  }, [yToSlot, paintOverlay]);

  const onUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const a = anchorRef.current;
    const c = currentRef.current;
    if (a !== null && c !== null) {
      const minI = Math.min(a, c);
      const maxI = Math.max(a, c) + 1;
      const newStart = fromIdx(minI);
      const newEnd = fromIdx(maxI, true);
      onChangeStart(newStart);
      onChangeEnd(newEnd);
    }
    anchorRef.current = null;
    currentRef.current = null;
  }, [onChangeStart, onChangeEnd]);

  // Auto-scroll to selection on mount
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = Math.max(0, (startIdx - 3) * SLOT_H);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hour grid lines (static, memoized)
  const gridLines = useMemo(() => SLOTS.map((slot, i) => {
    const isHour = slot.minute === 0;
    return (
      <div
        key={i}
        className={`absolute left-0 right-0 ${isHour ? "border-t border-border/50" : "border-t border-border/10"}`}
        style={{ top: i * SLOT_H, height: SLOT_H }}
      >
        {isHour && (
          <span
            className="absolute text-[10px] font-medium text-muted-foreground/70 leading-none pointer-events-none select-none"
            style={{ left: 8, top: 3, width: LABEL_W - 14 }}
          >
            {slot.label}
          </span>
        )}
      </div>
    );
  }), []);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Summary bar ── */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 border border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Clock className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-foreground">{fmtTime(liveStart)}</span>
            <span className="text-xs text-muted-foreground">→</span>
            <span className="text-sm font-semibold text-foreground">{fmtTime(liveEnd)}</span>
          </div>
        </div>
        <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          {calcDuration(liveStart, liveEnd)}
        </span>
      </div>

      {/* ── Dropdowns row ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1 block">
            Start Time
          </label>
          <select
            value={startTime}
            onChange={(e) => onChangeStart(e.target.value)}
            className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
          >
            {TIME_OPTS.map(o => <option key={`s-${o.value}`} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1 block">
            End Time
          </label>
          <select
            value={endTime}
            onChange={(e) => onChangeEnd(e.target.value)}
            className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-shadow"
          >
            {TIME_OPTS.map(o => <option key={`e-${o.value}`} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Time grid ── */}
      <div
        ref={containerRef}
        className="relative border border-border rounded-lg overflow-y-auto select-none cursor-cell bg-background"
        style={{ height: 380, touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      >
        <div style={{ height: SLOTS.length * SLOT_H, position: "relative" }}>
          {gridLines}

          {/* Selection overlay */}
          <div
            ref={overlayRef}
            className="absolute pointer-events-none transition-none"
            style={{
              left: LABEL_W,
              right: 6,
              top: selStart * SLOT_H,
              height: (selEnd - selStart + 1) * SLOT_H,
              background: "hsl(var(--primary) / 0.15)",
              borderLeft: "3px solid hsl(var(--primary))",
              borderRadius: "2px 6px 6px 2px",
              willChange: "top, height",
              boxShadow: "inset 0 1px 0 hsl(var(--primary) / 0.25), inset 0 -1px 0 hsl(var(--primary) / 0.25)",
            }}
          >
            {/* Top time label */}
            <div
              className="absolute -top-0.5 left-1 text-[9px] font-bold text-primary pointer-events-none select-none"
              style={{ transform: "translateY(-100%)" }}
            >
              {fmtTime(liveStart)}
            </div>
            {/* Bottom time label */}
            <div
              className="absolute -bottom-0.5 left-1 text-[9px] font-bold text-primary pointer-events-none select-none"
              style={{ transform: "translateY(100%)" }}
            >
              {fmtTime(liveEnd)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
