import { DeltaChip } from "./DeltaChip";
import { Sparkline } from "./Sparkline";
import { Agg, DailyPoint, fmtHKD, fmtNum, pctDelta } from "./utils";

interface Props {
  cur: Agg;
  prev: Agg | null;
  dailyCurrent: DailyPoint[];
}

function Card({
  label,
  value,
  subline,
  delta,
  invert = false,
  sparkData,
}: {
  label: string;
  value: string;
  subline?: string;
  delta: number | null;
  invert?: boolean;
  sparkData: { v: number }[];
}) {
  return (
    <div className="card-glass rounded-xl border border-border/60 p-4 flex flex-col min-h-[128px]">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
        <span className="text-[24px] leading-none font-semibold tabular-nums">{value}</span>
        <DeltaChip value={delta} invert={invert} suffix="" />
      </div>
      {subline && <div className="mt-1 text-[12px] text-muted-foreground tabular-nums">{subline}</div>}
      <div className="mt-auto -mx-1">
        <Sparkline data={sparkData} height={40} />
      </div>
    </div>
  );
}

export function KpiRow({ cur, prev, dailyCurrent }: Props) {
  const curSpend = cur.guests ? cur.revenue / cur.guests : 0;
  const prevSpend = prev && prev.guests ? prev.revenue / prev.guests : 0;
  const curCheck = cur.orders ? cur.revenue / cur.orders : 0;
  const prevCheck = prev && prev.orders ? prev.revenue / prev.orders : 0;
  const curDiscRate = cur.gross ? (Math.abs(cur.discount) / cur.gross) * 100 : 0;
  const prevDiscRate = prev && prev.gross ? (Math.abs(prev.discount) / prev.gross) * 100 : 0;

  const guestsPerDay = cur.days ? cur.guests / cur.days : 0;

  const sparkRev = dailyCurrent.map((p) => ({ v: p.revenue }));
  const sparkGuests = dailyCurrent.map((p) => ({ v: p.guests }));
  const sparkSpend = dailyCurrent.map((p) => ({ v: p.guests ? p.revenue / p.guests : 0 }));
  const sparkCheck = dailyCurrent.map((p) => ({ v: p.orders ? p.revenue / p.orders : 0 }));

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        label="Covers"
        value={fmtNum(cur.guests)}
        subline={`${fmtNum(guestsPerDay)} guests/day`}
        delta={prev ? pctDelta(cur.guests, prev.guests) : null}
        sparkData={sparkGuests}
      />
      <Card
        label="Avg Spend / Guest"
        value={`HK$${fmtHKD(curSpend)}`}
        delta={prev && prev.guests ? pctDelta(curSpend, prevSpend) : null}
        sparkData={sparkSpend}
      />
      <Card
        label="Avg Check"
        value={`HK$${fmtHKD(curCheck)}`}
        delta={prev && prev.orders ? pctDelta(curCheck, prevCheck) : null}
        sparkData={sparkCheck}
      />
      <Card
        label="Discount Rate"
        value={`${curDiscRate.toFixed(1)}%`}
        delta={prev && prev.gross ? curDiscRate - prevDiscRate : null}
        invert
        sparkData={sparkRev.map((_, i) => {
          const p = dailyCurrent[i];
          const gross = p.revenue; // approx
          return { v: gross };
        })}
      />
    </div>
  );
}
