import { useMemo } from "react";
import {
  aggregateByServicePeriod,
  aggregateByVenue,
  aggregateByWeekday,
  aggregateDaily,
  aggregateMonthly,
  buildDailySeries,
  filterByVenues,
  filterByWeekdays,
  isOperationalLine,
  targetToDate,
  remainingBusinessDays,
} from "@/utils/revenueTargetAnalytics";
import type {
  ActualDailyRow,
  ManagerTargetLine,
  StatisticalDailyRowV2,
  VenueServicePeriod,
} from "@/types/revenueTargetsV2";

export interface UseRevenueTargetAnalyticsArgs {
  year: number;
  month: number;
  venueIds: string[];               // scope venues (empty = none)
  managerLines: ManagerTargetLine[];
  statistical: StatisticalDailyRowV2[];
  actuals: ActualDailyRow[];
  periods: VenueServicePeriod[];
  weekdays?: number[];              // filter
  servicePeriodIds?: string[];      // filter (service-period Manager rollup)
  asOfDate?: string;                // for TTD
}

function monthDates(year: number, month: number): string[] {
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

export function useRevenueTargetAnalytics(args: UseRevenueTargetAnalyticsArgs) {
  const {
    year, month, venueIds, managerLines, statistical, actuals, periods,
    weekdays = [], servicePeriodIds = [], asOfDate,
  } = args;

  return useMemo(() => {
    const dates = monthDates(year, month);

    // Apply operational and service-period filtering to Manager lines up-front.
    // Roll-up-only periods are excluded automatically by isOperationalLine.
    const spSet = new Set(servicePeriodIds);
    const filteredMgr = managerLines.filter((l) => {
      if (!isOperationalLine(l, periods)) return false;
      if (!spSet.size) return true;
      if (l.lineType === "event") return true;
      return l.servicePeriodId != null && spSet.has(l.servicePeriodId);
    });

    let points = buildDailySeries({
      venueIds, dates,
      managerLines: filteredMgr,
      periods, statistical, actuals,
    });
    points = filterByVenues(points, venueIds);
    points = filterByWeekdays(points, weekdays);

    const daily = aggregateDaily(points);
    const monthly = aggregateMonthly(points);
    const weekday = aggregateByWeekday(points);
    const byVenue = aggregateByVenue(points);
    const byServicePeriod = aggregateByServicePeriod(filteredMgr, periods);
    const ttd = asOfDate ? targetToDate(points, asOfDate) : null;
    const remaining = asOfDate ? remainingBusinessDays(points, asOfDate) : [];

    return { points, daily, monthly, weekday, byVenue, byServicePeriod, ttd, remaining };
  }, [year, month, venueIds.join(","), managerLines, statistical, actuals, periods, weekdays.join(","), servicePeriodIds.join(","), asOfDate]);
}
