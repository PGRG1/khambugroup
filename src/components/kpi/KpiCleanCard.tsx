import { Clock } from "lucide-react";
import { tonePill, toneBar, toneSoft, type Tone } from "@/components/kpi/toneStyles";
import { cn } from "@/lib/utils";

export function StatusChip({ label, count, tone, active, onClick }: { label: string; count: number; tone: Tone; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-2 text-left transition min-h-14 flex flex-col justify-center",
        active ? "bg-primary/10 border-primary/40 ring-1 ring-primary/25" : "bg-card border-border hover:bg-muted/50",
      )}
    >
      <div className={cn(
        "text-lg font-semibold tabular-nums",
        tone === "warn" && "text-warning",
        tone === "danger" && "text-destructive",
        tone === "success" && "text-primary",
      )}>{count}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
    </button>
  );
}

export function VenuePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "h-9 px-3 rounded-full text-xs border transition whitespace-nowrap",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted",
      )}
    >{children}</button>
  );
}

export function KpiCleanCard(props: {
  venue: string; title: string; periodLabel: string; autoLabel?: string;
  ownerLine?: string;
  statusTone: Tone; statusLabel: string;
  heroLabel: string; heroValue: string; heroSub?: string;
  progressPct: number; progressTone: Tone;
  rows: { label: string; value: string; highlight?: boolean }[];
  notice?: { tone: Tone; text: string } | null;
  footerLeft: string; footerTone?: Tone; footerAction: React.ReactNode;
}) {
  const tone = props.statusTone;
  return (
    <div className="rounded-xl border border-border/60 glass-surface overflow-hidden flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold font-display leading-snug break-words text-foreground">{props.title}</h3>
          <div className="mt-0.5 text-[11px] text-muted-foreground break-words">
            {props.venue} · {props.periodLabel}
            {props.autoLabel && (
              <span className="ml-1.5 inline-block px-1.5 py-[1px] rounded text-[9px] bg-info/10 text-info ring-1 ring-info/25">
                {props.autoLabel}
              </span>
            )}
          </div>
          {props.ownerLine && (
            <div className="mt-0.5 text-[11px] text-muted-foreground/80 truncate">{props.ownerLine}</div>
          )}
        </div>
        <span className={cn("shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap", tonePill[tone])}>
          {props.statusLabel}
        </span>
      </div>

      <div className="px-4 py-2 flex items-end justify-between gap-2 border-t border-border/40">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground break-words">{props.heroLabel}</div>
        <div className="text-[22px] font-bold tracking-tight tabular-nums whitespace-nowrap">{props.heroValue}</div>
      </div>
      {props.heroSub && (
        <div className="px-4 -mt-1 pb-2 text-[11px] text-muted-foreground break-words">{props.heroSub}</div>
      )}

      <div className="px-4">
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-500", toneBar[props.progressTone])}
            style={{ width: `${Math.max(2, Math.min(100, props.progressPct))}%` }} />
        </div>
      </div>

      {props.rows.length > 0 && (
        <div className="px-4 pt-3 pb-2 divide-y divide-border/40">
          {props.rows.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-[12px] py-1.5">
              <span className="text-muted-foreground break-words">{r.label}</span>
              <span className={cn("tabular-nums whitespace-nowrap", r.highlight ? "text-warning" : "text-foreground")}>{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {props.notice && (
        <div className={cn("mx-4 mb-3 rounded px-2.5 py-1.5 text-[11px] leading-snug break-words", toneSoft[props.notice.tone])}>
          {props.notice.text}
        </div>
      )}

      <div className="mt-auto px-4 py-2 bg-muted/30 border-t border-border/40 flex items-center justify-between gap-2">
        <div className={cn("text-[10px] flex items-center gap-1 min-w-0 break-words", props.footerTone === "warn" ? "text-warning" : "text-muted-foreground")}>
          <Clock className="h-3 w-3 shrink-0" />
          <span>{props.footerLeft}</span>
        </div>
        <div className="shrink-0">{props.footerAction}</div>
      </div>
    </div>
  );
}
