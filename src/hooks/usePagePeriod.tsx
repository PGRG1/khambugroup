import { useSharedPeriod } from '@/components/kit/PeriodControl';
import type { PeriodMode } from '@/utils/periodWindow';

/** Read-only period state for tenant pages; data dates only shade empty months. */
export function usePagePeriod(dates: string[] = [], initial = 'mtd', mode: PeriodMode = 'period', options: { allowFuture?: string; hints?: Record<string, string>; defaultMonth?: string; extraShortcuts?: boolean } = {}) {
  const period = useSharedPeriod(mode, initial, { ...options, dataMonths: [...new Set(dates.filter(Boolean).map(d => d.slice(0, 7)))], extraShortcuts: options.extraShortcuts ?? initial === 'last-12' });
  return { ...period, from: new Date(period.fromIso + 'T00:00:00'), to: new Date(period.toIso + 'T23:59:59.999') };
}