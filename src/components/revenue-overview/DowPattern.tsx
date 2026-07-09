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
    return { day, avg, total: rev };
  });
  const total = stats.reduce((s, d) => s + d.total, 0) || 1;
  const max = Math.max(...stats.map((s) => s.avg), 1);
  const top = stats.reduce((a, b) => (b.avg > a.avg ? b : a), stats[0]);

  const friSat = stats.filter((s) => s.day === "Fri" || s.day === "Sat").reduce((s, d) => s + d.total, 0);
  const friSatPct = (friSat / total) * 100;

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4">
      <div className="text-[13px] font-medium mb-3">Day-of-Week Pattern</div>
      <div className="space-y-2">
        {stats.map((s) => {
          const isTop = s.day === top.day && s.avg > 0;
          const w = (s.avg / max) * 100;
          return (
            <div key={s.day} className="flex items-center gap-2">
              <span className="text-[11px] w-8 text-muted-foreground">{s.day}</span>
              <div className="flex-1 h-3 rounded-sm bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-sm ${isTop ? "bg-primary" : "bg-primary/35"}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span className="text-[12px] tabular-nums w-20 text-right">HK${fmtHKD(s.avg, true)}</span>
            </div>
          );
        })}
      </div>
      {friSat > 0 && (
        <div className="mt-3 text-[12px] text-muted-foreground">
          Fri–Sat drive <span className="text-foreground font-medium tabular-nums">{friSatPct.toFixed(0)}%</span> of revenue
        </div>
      )}
    </div>
  );
}
