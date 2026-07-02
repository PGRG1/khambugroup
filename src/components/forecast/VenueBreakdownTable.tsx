import { useMemo } from "react";
import { SalesRecord } from "@/types/sales";
import { ForecastRecord } from "@/types/forecast";
import { formatCurrency } from "@/utils/salesUtils";

interface Props {
  year: number;
  month: number;
  selectedVenues: string[];
  salesData: SalesRecord[];
  forecasts: ForecastRecord[];
}

const VenueBreakdownTable = ({
  year,
  month,
  selectedVenues,
  salesData,
  forecasts,
}: Props) => {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = isCurrentMonth ? today.getDate() : daysInMonth;

  const rows = useMemo(() => {
    return selectedVenues.map((venue) => {
      const managerRows = forecasts.filter(
        (f) => f.date.startsWith(monthStr) && f.venue === venue,
      );
      const managerSum = managerRows.reduce(
        (s, f) => s + Number(f.forecastedTotalSales || 0),
        0,
      );
      const hasManagerRows = managerRows.length > 0;

      const actual = salesData
        .filter((s) => s.date.startsWith(monthStr) && s.venue === venue)
        .reduce((s, r) => s + Number(r.totalSales || 0), 0);

      const delta = hasManagerRows ? actual - managerSum : null;
      const pace =
        hasManagerRows && managerSum > 0 && daysElapsed > 0
          ? Math.round(
              (actual / (managerSum * (daysElapsed / daysInMonth))) * 100,
            )
          : null;

      return {
        venue,
        managerSum: hasManagerRows ? managerSum : null,
        actual,
        delta,
        pace,
      };
    });
  }, [selectedVenues, forecasts, salesData, monthStr, daysInMonth, daysElapsed]);

  if (rows.length === 0) return null;

  const totalMgr = rows.reduce((s, r) => s + (r.managerSum ?? 0), 0);
  const totalAct = rows.reduce((s, r) => s + r.actual, 0);
  const anyMgr = rows.some((r) => r.managerSum != null);

  return (
    <div className="card-glass rounded-xl p-4 overflow-x-auto">
      <h3 className="text-sm font-display font-semibold mb-3">
        Venue Breakdown — {monthStr}
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] text-muted-foreground">
            <th className="text-left py-2 px-2 font-semibold">Venue</th>
            <th className="text-right py-2 px-2 font-semibold">Statistical</th>
            <th className="text-right py-2 px-2 font-semibold">Manager</th>
            <th className="text-right py-2 px-2 font-semibold">Actual</th>
            <th className="text-right py-2 px-2 font-semibold">Δ Mgr</th>
            <th className="text-right py-2 px-2 font-semibold">Pace</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.venue}
              className="border-b border-border/40 hover:bg-muted/30 transition-colors"
            >
              <td className="py-2 px-2 font-medium">{r.venue}</td>
              <td className="py-2 px-2 text-right td-num text-muted-foreground">
                —
              </td>
              <td className="py-2 px-2 text-right td-num">
                {r.managerSum != null ? formatCurrency(r.managerSum) : "—"}
              </td>
              <td
                className="py-2 px-2 text-right td-num"
                style={{ color: "hsl(199 90% 55%)" }}
              >
                {formatCurrency(r.actual)}
              </td>
              <td
                className={`py-2 px-2 text-right td-num ${
                  r.delta == null
                    ? "text-muted-foreground"
                    : r.delta >= 0
                      ? "text-emerald-500"
                      : "text-destructive"
                }`}
              >
                {r.delta == null
                  ? "—"
                  : `${r.delta >= 0 ? "+" : ""}${formatCurrency(r.delta)}`}
              </td>
              <td
                className={`py-2 px-2 text-right td-num ${
                  r.pace == null
                    ? "text-muted-foreground"
                    : r.pace >= 100
                      ? "text-emerald-500"
                      : r.pace >= 80
                        ? "text-amber-500"
                        : "text-destructive"
                }`}
              >
                {r.pace == null ? "—" : `${r.pace}%`}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border font-semibold">
            <td className="py-2 px-2">Total</td>
            <td className="py-2 px-2 text-right td-num text-muted-foreground">
              —
            </td>
            <td className="py-2 px-2 text-right td-num">
              {anyMgr ? formatCurrency(totalMgr) : "—"}
            </td>
            <td
              className="py-2 px-2 text-right td-num"
              style={{ color: "hsl(199 90% 55%)" }}
            >
              {formatCurrency(totalAct)}
            </td>
            <td className="py-2 px-2" />
            <td className="py-2 px-2" />
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default VenueBreakdownTable;
