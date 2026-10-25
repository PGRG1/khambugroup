import { SalesRecord } from "@/types/sales";
import { fmtHKD, fmtNum, fmtDate, toDaily } from "./utils";

interface Props {
  data: SalesRecord[];
}

export function BestWorstStrip({ data }: Props) {
  const daily = toDaily(data);
  if (!daily.length) return null;

  const best = daily.reduce((a, b) => (b.revenue > a.revenue ? b : a));
  const worst = daily.reduce((a, b) => (b.revenue < a.revenue ? b : a));
  const busiest = daily.reduce((a, b) => (b.guests > a.guests ? b : a));
  const totalRev = daily.reduce((s, d) => s + d.revenue, 0);
  const totalGuests = daily.reduce((s, d) => s + d.guests, 0);
  const spend = totalGuests ? totalRev / totalGuests : 0;
  const dateLabel = (d: string) =>
    `${new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" })} · ${fmtDate(d)}`;

  const items = [
    { label: "Best day", date: dateLabel(best.date), value: `HK$ ${fmtHKD(best.revenue)}` },
    { label: "Busiest day", date: dateLabel(busiest.date), value: `${fmtNum(busiest.guests)} guests` },
    { label: "Softest day", date: dateLabel(worst.date), value: `HK$ ${fmtHKD(worst.revenue)}` },
    { label: "Spend per guest", date: `${fmtNum(totalGuests)} guests in period`, value: `HK$ ${fmtHKD(spend)}` },
  ];

  return (
    <div className="glass-surface rounded-xl border border-border/60 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 ">
        {items.map((it, i) => (
          <div key={i} className={i === 0 ? "" : "sm:pl-4"}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
            <div className="mt-1 text-[15px] font-semibold tabular-nums">{it.value}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">{it.date}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
