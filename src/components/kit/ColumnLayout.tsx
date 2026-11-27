// Resizable, hideable table columns for sales-table lists. Each person's widths and hidden columns are kept
// for them only (user_ui_prefs, row-level secured to the person; a local copy shows them at once), and
// "Reset columns" goes back to the built-in defaults. Computer and tablet only; phones use two-line lists.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Columns3 } from "lucide-react";
import "./kit.css";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

// grow: a name column that takes the spare space by default (other columns keep their width).
export type ColumnDef = { key: string; label: string; width: number; min?: number; lockShown?: boolean; grow?: boolean };
type Saved = { w?: Record<string, number>; hidden?: string[] };

const clampW = (n: number, min: number) => Math.max(min, Math.min(900, Math.round(n)));

export function useColumnLayout(prefKey: string, userId: string | null | undefined, cols: ColumnDef[], defaultHidden: string[] = []) {
  const storeKey = userId ? `cols:${prefKey}:${userId}` : null;
  const [saved, setSaved] = useState<Saved | null>(() => {
    try { return storeKey ? JSON.parse(localStorage.getItem(storeKey) ?? "null") : null; } catch { return null; }
  });
  // Server copy wins (it follows the person between computers); a missing table or row keeps the local copy.
  useEffect(() => {
    if (!userId) return;
    let on = true;
    void supabase.from("user_ui_prefs" as any).select("value").eq("user_id", userId).eq("pref_key", prefKey).maybeSingle()
      .then(({ data, error }) => {
        if (!on || error || !data) return;
        const v = (data as any).value as Saved;
        setSaved(v);
        try { if (storeKey) localStorage.setItem(storeKey, JSON.stringify(v)); } catch { /* optional */ }
      });
    return () => { on = false; };
  }, [userId, prefKey, storeKey]);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  const persist = useCallback((next: Saved | null) => {
    setSaved(next);
    try { if (storeKey) { if (next) localStorage.setItem(storeKey, JSON.stringify(next)); else localStorage.removeItem(storeKey); } } catch { /* optional */ }
    if (!userId) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = supabase.from("user_ui_prefs" as any);
      void (next
        ? q.upsert({ user_id: userId, pref_key: prefKey, value: next, updated_at: new Date().toISOString() } as any, { onConflict: "user_id,pref_key" })
        : q.delete().eq("user_id", userId).eq("pref_key", prefKey));
    }, 600);
  }, [storeKey, userId, prefKey]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const hidden = useMemo(() => new Set(saved?.hidden ?? defaultHidden), [saved, defaultHidden]);
  const shown = useMemo(() => cols.filter((c) => c.lockShown || !hidden.has(c.key)), [cols, hidden]);
  const widthOf = useCallback((c: ColumnDef) => clampW(saved?.w?.[c.key] ?? c.width, c.min ?? 60), [saved]);
  // `now` = every shown column's width as drawn, kept on the first resize so the other columns don't jump.
  const setWidth = (key: string, w: number, now?: Record<string, number>) => {
    const c = cols.find((x) => x.key === key); if (!c) return;
    const base = saved?.w && Object.keys(saved.w).length ? saved.w : Object.fromEntries(Object.entries(now ?? {}).map(([k, v]) => [k, Math.round(v)]));
    persist({ ...saved, w: { ...base, [key]: clampW(w, c.min ?? 60) } });
  };
  const toggle = (key: string) => {
    const h = new Set(hidden); h.has(key) ? h.delete(key) : h.add(key);
    persist({ ...saved, hidden: [...h] });
  };
  const reset = () => persist(null);
  const changed = !!saved && (Object.keys(saved.w ?? {}).length > 0 || saved.hidden !== undefined);
  // Until the person resizes, the default widths are shared out to fill the table's space exactly.
  const resized = !!saved?.w && Object.keys(saved.w).length > 0;
  const tableWidth = shown.reduce((n, c) => n + widthOf(c), 0);
  // Until then, name columns share whatever space is left, never below their minimum.
  const floor = shown.reduce((n, c) => n + (c.grow ? c.min ?? 60 : widthOf(c)), 0);
  const tableStyle: CSSProperties = resized ? { width: tableWidth, minWidth: tableWidth } : { width: "100%", minWidth: floor };
  const colWidth = (c: ColumnDef) => (resized || !c.grow ? widthOf(c) : undefined);
  return { shown, hidden, widthOf, colWidth, setWidth, toggle, reset, changed, tableWidth, tableStyle };
}

/** Drag the right edge of a header to resize; double-click it to fit the column to its longest text. */
export function ResizeHandle({ colKey, min = 60, onResize, label }: { colKey: string; width?: number; min?: number; onResize: (w: number, now: Record<string, number>) => void; label: string }) {
  const [live, setLive] = useState<number | null>(null);
  const start = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault(); e.stopPropagation();
    const th = (e.currentTarget.parentElement as HTMLElement);
    const table = th.closest("table") as HTMLTableElement | null;
    const now = drawnWidths(table);
    // Fix every column at its drawn width while dragging, so only this one moves.
    if (table) {
      table.style.width = `${Object.values(now).reduce((a, b) => a + b, 0)}px`;
      table.querySelectorAll<HTMLTableColElement>("col[data-col]").forEach((c) => { c.style.width = `${now[c.dataset.col!] ?? 0}px`; });
    }
    const x0 = e.clientX, w0 = now[colKey] ?? th.getBoundingClientRect().width;
    const col = table?.querySelector<HTMLTableColElement>(`col[data-col="${colKey}"]`);
    const others = Object.entries(now).filter(([k]) => k !== colKey).reduce((a, [, v]) => a + v, 0);
    const move = (ev: PointerEvent) => {
      const w = clampW(w0 + ev.clientX - x0, min); setLive(w);
      if (col) col.style.width = `${w}px`;
      if (table) table.style.width = `${others + w}px`;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setLive(null); onResize(w0 + ev.clientX - x0, now);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const fit = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const table = e.currentTarget.closest("table"); if (!table) return;
    let w = min;
    table.querySelectorAll<HTMLElement>(`[data-col="${colKey}"]`).forEach((el) => {
      if (el.tagName === "COL") return;
      const cs = getComputedStyle(el);
      const inner = Array.from(el.children).reduce((n, ch) => Math.max(n, (ch as HTMLElement).scrollWidth), 0);
      w = Math.max(w, Math.max(el.scrollWidth, inner + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) + 8);
    });
    onResize(w, drawnWidths(table as HTMLTableElement));
  };
  return (
    <span role="separator" aria-orientation="vertical" aria-label={`Resize ${label}`} title="Drag to resize · double-click to fit"
      className={"kit-col-resize" + (live != null ? " is-dragging" : "")} onPointerDown={start} onDoubleClick={fit} onClick={(e) => e.stopPropagation()} />
  );
}

function drawnWidths(table: HTMLTableElement | null): Record<string, number> {
  const out: Record<string, number> = {};
  table?.querySelectorAll<HTMLElement>("thead th[data-col]").forEach((th) => { out[th.dataset.col!] = th.getBoundingClientRect().width; });
  return out;
}

/** Cell style for resizable tables: one line, cut with … when narrowed; full text goes in title. */
export const fitCell: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "none" };

export function ColumnsButton({ cols, hidden, onToggle, onReset, changed }: { cols: ColumnDef[]; hidden: Set<string>; onToggle: (k: string) => void; onReset: () => void; changed: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="kit kit-btn kit-tool-btn" aria-label="Columns"><Columns3 className="h-4 w-4" /> <span className="kit-tool-label">Columns</span></button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="px-2 pb-1 text-[12px] text-muted-foreground">Show columns</div>
        {cols.map((c) => (
          <label key={c.key} className="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13px] hover:bg-muted/50">
            <Checkbox checked={c.lockShown || !hidden.has(c.key)} disabled={c.lockShown} onCheckedChange={() => onToggle(c.key)} /> {c.label}
          </label>
        ))}
        <div className="mt-1 border-t border-border pt-1">
          <button type="button" className="h-8 w-full rounded px-2 text-left text-[13px] text-[#1F6B5E] hover:bg-muted/50 disabled:text-muted-foreground" disabled={!changed} onClick={onReset}>Reset columns</button>
          <p className="px-2 pb-1 text-[11.5px] text-muted-foreground">Drag a column edge to resize. Double-click it to fit.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
