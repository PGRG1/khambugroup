import { SalesRecord } from "@/types/sales";
import { fmtHKD } from "./utils";

const ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

interface Props {
  data: SalesRecord[];
}

export function DowPattern({ data }: Props) {
  const stats = ORDER.map((day) => {
    const rows = data.filter((r) => r.day.startsWith(day));
    const dates = new Set(rows.map((r) => r.date));
    const rev = rows.reduce((s, r) => s + r.totalSales, 0);
    const avg = dates.size ? rev / dates.size : 0;
    return { day, avg, total: rev, dateCount: dates.size };
  });
  const total = stats.reduce((s, d) => s + d.total, 0) || 1;
  const max = Math.max(...stats.map((s) => s.avg), 1);
  const top = stats.reduce((a, b) => (b.avg > a.avg ? b : a), stats[0]);

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4">
      <div className="text-[13px] font-medium mb-3">Day-of-Week Pattern</div>
      <div className="space-y-2">
        {stats.map((s) => {
          const isTop = s.day === top.day && s.avg > 0;
          const w = (s.avg / max) * 100;
          const share = (s.total / total) * 100;
          return (
            <div
              key={s.day}
              className="flex items-center gap-2 px-1 rounded transition-colors hover:bg-muted/40"
              title={`${FULL[s.day]} · ${s.dateCount} day(s)`}
            >
              <span className="text-[11px] w-8 text-muted-foreground">{s.day}</span>
              <div className="flex-1 h-3 rounded-sm bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-sm transition-all duration-500 ease-out ${isTop ? "bg-primary" : "bg-primary/35"}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span className="text-[12px] tabular-nums w-24 text-right leading-tight">
                <span className="block">HK${fmtHKD(s.avg, true)}</span>
                <span className="text-[10px] text-muted-foreground">{share.toFixed(1)}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
