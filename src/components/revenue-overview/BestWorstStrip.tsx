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
  const highestCheck = daily.reduce((a, b) => {
    const ac = a.orders ? a.revenue / a.orders : 0;
    const bc = b.orders ? b.revenue / b.orders : 0;
    return bc > ac ? b : a;
  });
  const hcCheck = highestCheck.orders ? highestCheck.revenue / highestCheck.orders : 0;

  const items = [
    { label: "Best day", date: best.date, value: `HK$${fmtHKD(best.revenue)}` },
    { label: "Softest day", date: worst.date, value: `HK$${fmtHKD(worst.revenue)}` },
    { label: "Busiest by covers", date: busiest.date, value: `${fmtNum(busiest.guests)} covers` },
    { label: "Highest avg check", date: highestCheck.date, value: `HK$${fmtHKD(hcCheck)}` },
  ];

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:divide-x sm:divide-border/40">
        {items.map((it, i) => (
          <div key={i} className={i === 0 ? "" : "sm:pl-4"}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
            <div className="mt-1 text-[15px] font-semibold tabular-nums">{it.value}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">{fmtDate(it.date)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
