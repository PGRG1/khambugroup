import { formatDate, formatMonthLabel } from '@/utils/format';
export type PeriodMode = 'period' | 'month' | 'asat';
export type PeriodSelection = { from: string; to: string; key: string };
export function shiftMonth(month: string, offset: number) {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function monthEnd(month: string) { return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10); }
export function periodMonths(start: string, today: string, futureEnd?: string) {
  const end = futureEnd && futureEnd > today.slice(0, 7) ? futureEnd.slice(0, 7) : today.slice(0, 7);
  const months: string[] = [];
  for (let m = start.slice(0, 7); /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= end && months.length < 1200; m = shiftMonth(m, 1)) months.push(m);
  return months.reverse();
}
export function monthSelection(month: string, today: string, mode: PeriodMode): PeriodSelection {
  const end = monthEnd(month), to = end > today ? today : end;
  return { from: mode === 'asat' ? to : month + '-01', to, key: month };
}
export function shortcutSelection(key: string, today: string, fiscalStart = 1): PeriodSelection {
  const month = today.slice(0, 7), year = Number(today.slice(0, 4));
  const fy = year - (Number(month.slice(5)) < fiscalStart ? 1 : 0);
  const fyStart = `${fy}-${String(fiscalStart).padStart(2, '0')}`;
  if (key === 'last-month') return { from: shiftMonth(month, -1) + '-01', to: monthEnd(shiftMonth(month, -1)), key };
  if (key === 'today') return { from: today, to: today, key };
  if (key === 'last-month-end') { const to = monthEnd(shiftMonth(month, -1)); return { from: to, to, key }; }
  if (key === 'last-year-end') { const to = `${year - 1}-12-31`; return { from: to, to, key }; }
  if (key === 'last-12') return { from: shiftMonth(month, -12) + '-01', to: monthEnd(shiftMonth(month, -1)), key };
  if (key === 'this-year' || key === 'ytd') return { from: fyStart + '-01', to: today, key };
  if (key === 'last-year') return { from: shiftMonth(fyStart, -12) + '-01', to: monthEnd(shiftMonth(fyStart, -1)), key };
  return { from: month + '-01', to: today, key };
}
export function selectionLabel(value: PeriodSelection, mode: PeriodMode, today: string, fiscalStart = 1) {
  if (mode === 'asat') return formatDate(value.to);
  if (mode === 'month' || /^\d{4}-\d{2}$/.test(value.key)) return formatMonthLabel(value.from.slice(0, 7));
  if (value.key === 'mtd') return `${formatMonthLabel(today.slice(0, 7)).split(' ')[0]} so far`;
  if (value.key === 'last-month') return formatMonthLabel(value.from.slice(0, 7));
  if (value.key === 'this-year' || value.key === 'last-year' || value.key === 'ytd') {
    const y = Number(value.from.slice(0, 4)); return fiscalStart === 1 ? String(y) : `FY ${y}/${String(y + 1).slice(-2)}`;
  }
  return `${formatDate(value.from)} – ${formatDate(value.to)}`;
}
export function validSessionSelection(stored: { day?: string; value?: PeriodSelection } | null, today: string, start: string, end = today) {
  const v = stored?.value;
  return stored?.day === today && v && v.from >= start.slice(0, 7) + '-01' && v.to <= end && v.from <= v.to ? v : undefined;
}
export function journalDateException(date: string, start: string, today: string) {
  const limit = new Date(today + 'T00:00:00Z'); limit.setUTCDate(limit.getUTCDate() + 31);
  return date.slice(0, 10) < start.slice(0, 7) + '-01' ? 'before' : date.slice(0, 10) > limit.toISOString().slice(0, 10) ? 'after' : null;
}