import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import type { VenueServicePeriod } from "@/types/revenueTargetsV2";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "—");

function toMinutes(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function isEffective(p: VenueServicePeriod, todayISO: string) {
  if (p.effectiveFrom && p.effectiveFrom > todayISO) return false;
  if (p.effectiveTo && p.effectiveTo < todayISO) return false;
  return true;
}

/** Minutes until `target` (0..1439) from `now` (0..1439), wrapping past midnight. */
function minutesUntil(now: number, target: number) {
  const d = target - now;
  return d >= 0 ? d : d + 1440;
}

function fmtDelta(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `in ${h}h ${m}m`;
  if (h) return `in ${h}h`;
  return `in ${m}m`;
}

export default function TodayClassification({
  venueName,
  periods,
  loading,
}: {
  venueName: string | null;
  periods: VenueServicePeriod[];
  loading: boolean;
}) {
  // Local clock, refreshed each minute so the highlighted period stays honest.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const todayISO = now.toISOString().slice(0, 10);
  const dow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todaysPeriods = useMemo(
    () =>
      periods
        .filter((p) => p.isActive && !p.isRollupOnly)
        .filter((p) => isEffective(p, todayISO))
        .filter((p) => !p.applicableWeekdays.length || p.applicableWeekdays.includes(dow))
        .sort((a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0)),
    [periods, todayISO, dow],
  );

  const current = useMemo(() => {
    return (
      todaysPeriods.find((p) => {
        const s = toMinutes(p.startTime);
        const e = toMinutes(p.endTime);
        if (s == null || e == null) return false;
        return p.crossesMidnight || e < s ? nowMin >= s || nowMin < e : nowMin >= s && nowMin < e;
      }) ?? null
    );
  }, [todaysPeriods, nowMin]);

  const next = useMemo(() => {
    if (!todaysPeriods.length) return null;
    if (current) {
      const e = toMinutes(current.endTime);
      return e == null ? null : { label: `${current.name} ends`, at: hhmm(current.endTime), mins: minutesUntil(nowMin, e) };
    }
    const upcoming = todaysPeriods
      .map((p) => ({ p, s: toMinutes(p.startTime) }))
      .filter((x): x is { p: VenueServicePeriod; s: number } => x.s != null)
      .map((x) => ({ ...x, delta: minutesUntil(nowMin, x.s) }))
      .sort((a, b) => a.delta - b.delta)[0];
    return upcoming
      ? { label: `${upcoming.p.name} starts`, at: hhmm(upcoming.p.startTime), mins: upcoming.delta }
      : null;
  }, [todaysPeriods, current, nowMin]);

  const timeNote = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Today's Classification</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {venueName ? `${venueName} · ${WEEKDAY_LABELS[dow]}` : "No venue selected"}
          </div>
        </div>
        <span className="td-num text-[11px] text-muted-foreground shrink-0 inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeNote}
        </span>
      </div>

      <div className="mt-3.5">
        {loading ? (
          <div className="text-[12px] text-muted-foreground py-8 text-center">Loading…</div>
        ) : !venueName ? (
          <div className="text-[12px] text-muted-foreground py-8 text-center">
            Select a venue to preview how its trading day is classified.
          </div>
        ) : todaysPeriods.length === 0 ? (
          <div className="text-[12px] text-muted-foreground py-8 text-center">
            No service periods apply to this venue today.
          </div>
        ) : (
          <ol className="relative pl-4">
            <span className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-primary/20" aria-hidden />
            {todaysPeriods.map((p) => {
              const active = current?.id === p.id;
              return (
                <li key={p.id} className="relative py-1.5">
                  <span
                    className={`absolute -left-4 top-[11px] h-[7px] w-[7px] rounded-full ${
                      active ? "bg-primary ring-4 ring-primary/15" : "bg-muted-foreground/40"
                    }`}
                    aria-hidden
                  />
                  <div
                    className={`flex items-baseline justify-between gap-3 rounded-md px-2 py-1 ${
                      active ? "bg-primary/10" : ""
                    }`}
                  >
                    <span
                      className={`text-[13px] truncate ${
                        active ? "font-semibold text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {p.name}
                    </span>
                    <span className="td-num text-[11px] text-muted-foreground shrink-0">
                      {hhmm(p.startTime)}–{hhmm(p.endTime)}
                      {p.crossesMidnight ? " +1d" : ""}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {!loading && venueName && todaysPeriods.length > 0 && (
        <dl className="mt-3.5 space-y-1.5 border-t border-border/60 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Current period</dt>
            <dd className="text-[12px] font-medium truncate">{current ? current.name : "Outside configured hours"}</dd>
          </div>
          {next && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Next change</dt>
              <dd className="text-[12px] td-num">
                {next.at} <span className="text-muted-foreground">· {next.label}, {fmtDelta(next.mins)}</span>
              </dd>
            </div>
          )}
          <div className="text-[11px] text-muted-foreground pt-1">
            Times shown in your device's local time.
          </div>
        </dl>
      )}
    </div>
  );
}
