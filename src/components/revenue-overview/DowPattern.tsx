import {baseSymbol} from '@/utils/money';
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
  const traded = stats.filter((s) => s.avg > 0);
  const low = traded.length > 1 ? traded.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4 h-full flex flex-col">
      <div className="mb-3">
        <div className="text-[13px] font-medium">Sales by weekday</div>
        <div className="text-[11px] text-muted-foreground">Average a day · share of sales</div>
      </div>
      <div className="flex-1 flex flex-col justify-around gap-2">
        {stats.map((s) => {
          const isTop = s.day === top.day && s.avg > 0;
          const isLow = !!low && s.day === low.day && !isTop;
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
                  className={`h-full rounded-sm ${isTop ? "bg-primary" : isLow ? "bg-warning" : "bg-primary/35"}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              {/* One line per day: amount, then its share of the period's sales. */}
              <span className="w-[4.75rem] shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums">{baseSymbol()}{fmtHKD(s.avg, true)}</span>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{share.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
