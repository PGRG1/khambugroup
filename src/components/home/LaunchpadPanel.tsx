import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Upload, ArrowRight, X } from "lucide-react";
import { useFloatingBaniAttach } from "@/components/assistant/FloatingBaniContext";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { fmtHKD, fmtNum, pctDelta } from "@/components/revenue-overview/utils";

type SaleRow = { date: string; venue: string | null; total_sales: number | null; guests: number | null };
export type LaunchpadItem = { key: string; title: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ago = (n: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };

/** Operator front door: yesterday per venue, missing closing reports, one drop zone, and the follow-up list. */
export function LaunchpadPanel({ sales, venues, items, loading }: { sales: SaleRow[]; venues: string[]; items: LaunchpadItem[]; loading: boolean }) {
  const attach = useFloatingBaniAttach();
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const storeKey = `bani-launchpad-dismissed:${tenantId ?? "none"}`;
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) || "[]"); } catch { return []; }
  });

  const y = iso(ago(1)), lw = iso(ago(8));
  const rows = useMemo(() => venues.map((v) => {
    const pick = (d: string) => sales.filter((r) => r.date === d && (r.venue ?? "").toLowerCase() === v.toLowerCase());
    const yr = pick(y), pr = pick(lw);
    const rev = yr.reduce((s, r) => s + (Number(r.total_sales) || 0), 0);
    const guests = yr.reduce((s, r) => s + (Number(r.guests) || 0), 0);
    const prev = pr.reduce((s, r) => s + (Number(r.total_sales) || 0), 0);
    return { venue: v, logged: yr.length > 0, rev, guests, delta: prev > 0 ? pctDelta(rev, prev) : null };
  }), [sales, venues, y, lw]);

  const logged = rows.filter((r) => r.logged);
  const missing = rows.filter((r) => !r.logged);
  const total = logged.reduce((s, r) => s + r.rev, 0);
  const best = [...logged].sort((a, b) => (b.delta ?? -999) - (a.delta ?? -999))[0];

  let brief = "";
  if (!venues.length) brief = "No active venues yet. Add a venue in Admin to start tracking trade.";
  else if (!logged.length) brief = "No closing reports are in for yesterday yet. Drop the Z-reports below and I'll read them.";
  else {
    brief = `Yesterday closed at HK$ ${fmtHKD(total)} across ${logged.length} venue${logged.length === 1 ? "" : "s"}.`;
    if (best && best.delta != null && logged.length > 1) brief += ` ${best.venue} led at ${best.delta >= 0 ? "+" : ""}${best.delta.toFixed(0)}% vs last week.`;
    if (missing.length) brief += ` Still waiting on ${missing.map((m) => m.venue).join(", ")}.`;
  }

  const send = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) attach(files);
  };
  const dismiss = (k: string) => {
    const next = [...dismissed, k];
    setDismissed(next);
    localStorage.setItem(storeKey, JSON.stringify(next));
  };
  const open = items.filter((i) => !dismissed.includes(i.key));

  return (
    <section className="space-y-3">
      <div className="glass-surface rounded-xl border border-border/60 p-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Today's brief</p>
        <p className="font-display text-[17px] font-semibold leading-snug mt-1">{loading ? "Reading yesterday's trade…" : brief}</p>
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
        className={`w-full rounded-xl border-2 border-dashed p-4 flex items-center gap-3 text-left transition-colors ${over ? "border-primary bg-primary/10" : "border-border/70 glass-surface hover:bg-muted/40"}`}
      >
        <Upload className="h-5 w-5 text-primary shrink-0" />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">Drop or scan any file</span>
          <span className="block text-[12px] text-muted-foreground">Z-report, supplier invoice or expense receipt. Bani sorts it.</span>
        </span>
      </button>
      <input ref={input} type="file" multiple accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => { send(e.target.files); e.target.value = ""; }} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="glass-surface rounded-xl border border-border/60 p-4">
          <p className="text-[13px] font-semibold mb-2">Yesterday by venue</p>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.venue} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex items-center gap-2 min-w-0">
                  {r.logged ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> : <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                  <span className="truncate font-medium">{r.venue}</span>
                </span>
                {r.logged ? (
                  <span className="text-right shrink-0">
                    <span className="td-num">HK$ {fmtHKD(r.rev)}</span>
                    <span className="text-muted-foreground text-[12px]"> · {fmtNum(r.guests)} guests{r.delta != null ? ` · ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(0)}%` : ""}</span>
                  </span>
                ) : (
                  <button onClick={() => input.current?.click()} className="text-[12px] font-medium text-destructive shrink-0">Z-report missing · Scan</button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-surface rounded-xl border border-border/60 p-4">
          <p className="text-[13px] font-semibold mb-2">To follow up</p>
          {open.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing waiting on you.</p>
          ) : (
            <ul className="space-y-2">
              {open.map((i) => (
                <li key={i.key} className="flex items-center gap-2 text-[13px]">
                  <button onClick={() => navigate(i.to)} className="flex-1 min-w-0 text-left truncate hover:text-primary inline-flex items-center gap-1">
                    {i.title} <ArrowRight className="h-3 w-3 shrink-0" />
                  </button>
                  <button onClick={() => dismiss(i.key)} title="Not an issue" aria-label="Not an issue" className="text-muted-foreground hover:text-foreground shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/finance-team" className="mt-3 text-[12px] font-medium text-primary inline-flex items-center gap-1">Full team review <ArrowRight className="h-3 w-3" /></Link>
        </div>
      </div>
    </section>
  );
}
