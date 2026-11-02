import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBooksWindow } from '@/hooks/useBooksWindow';
import { useAuth } from '@/hooks/useAuth';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { formatMonthLabel } from '@/utils/format';
import { monthEnd, monthSelection, periodMonths, selectionLabel, shortcutSelection, validSessionSelection, type PeriodMode, type PeriodSelection } from '@/utils/periodWindow';
import { cn } from '@/lib/utils';

type Props = { mode: PeriodMode; value: PeriodSelection; onChange: (value: PeriodSelection) => void; booksStart?: string; allowFuture?: string; hints?: Record<string, string>; dataMonths?: string[]; extraShortcuts?: boolean; financialYear?: boolean };
export function PeriodControl({ mode, value, onChange, booksStart, allowFuture, hints = {}, dataMonths, extraShortcuts = false, financialYear = false }: Props) {
  const window = useBooksWindow(), today = window.today, start = booksStart ?? window.start, fiscal = financialYear ? window.fiscalStart : 1;
  const mobile = useIsMobile(), [open, setOpen] = useState(false), [custom, setCustom] = useState(false), [range, setRange] = useState<DateRange>(), [anchor, setAnchor] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const months = periodMonths(start, today, allowFuture), years = [...new Set(months.map(m => m.slice(0, 4)))];
  const title = mode === 'month' ? 'Month' : mode === 'asat' ? 'As at' : 'Period';
  const choose = (next: PeriodSelection) => { onChange(next); setOpen(false); setCustom(false); setAnchor(null); };
  useEffect(() => {
    if (!open || custom) return;
    const frame = requestAnimationFrame(() => {
      const selected = list.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (selected && list.current) list.current.scrollTop = Math.max(0, list.current.scrollTop + selected.getBoundingClientRect().top - list.current.getBoundingClientRect().top - 36);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, custom, mobile]);
  const keys = mode === 'month' ? ['mtd', 'last-month'] : mode === 'asat' ? ['today', 'last-month-end', 'last-year-end', 'custom'] : ['mtd', 'last-month', 'this-year', 'last-year', ...(extraShortcuts ? ['ytd', 'last-12'] : []), 'custom'];
  const labels: Record<string, string> = { mtd: mode === 'month' ? 'This month' : `${formatMonthLabel(today.slice(0, 7)).split(' ')[0]} so far`, 'last-month': 'Last month', 'this-year': fiscal === 1 ? 'This year' : selectionLabel(shortcutSelection('this-year', today, fiscal), mode, today, fiscal), 'last-year': fiscal === 1 ? 'Last year' : selectionLabel(shortcutSelection('last-year', today, fiscal), mode, today, fiscal), ytd: 'Year to date', 'last-12': 'Last 12 months', today: 'Today', 'last-month-end': 'End of last month', 'last-year-end': 'End of last year', custom: mode === 'asat' ? 'Pick a date…' : 'Custom range…' };
  const shortcut = (key: string) => {
    if (key === 'custom') { setCustom(true); setRange({ from: new Date(value.from + 'T12:00:00'), to: new Date(value.to + 'T12:00:00') }); return; }
    const next = shortcutSelection(key, today, fiscal); if (next.to < start.slice(0,7)+'-01') return; choose({ ...next, from: mode === 'asat' ? next.to : next.from < start ? start.slice(0, 7) + '-01' : next.from });
  };
  const selectMonth = (m: string) => {
    const lastDay = allowFuture ? monthEnd(m) : monthEnd(m) > today ? today : monthEnd(m);
    if (mobile && mode === 'period') {
      if (!anchor) { setAnchor(m); return; }
      const first = [anchor, m].sort()[0], last = [anchor, m].sort()[1];
      choose({ from: first + '-01', to: allowFuture ? monthEnd(last) : monthEnd(last) > today ? today : monthEnd(last), key: first === last ? first : 'custom' }); return;
    }
    choose({ from: mode === 'asat' ? lastDay : m + '-01', to: lastDay, key: m });
  };
  const monthButton = (m: string, grid = false) => {
    const outside = !months.includes(m), empty = dataMonths !== undefined && !dataMonths.includes(m);
    const selected = anchor === m || (!anchor && (mode === 'asat' ? value.to.slice(0, 7) === m : m >= value.from.slice(0, 7) && m <= value.to.slice(0, 7)));
    return <Button key={m} variant={selected ? 'secondary' : 'ghost'} disabled={outside} aria-label={formatMonthLabel(m)} aria-pressed={selected} onClick={() => selectMonth(m)} className={cn('h-10 justify-between font-normal shrink-0', grid ? 'w-full px-1 text-xs flex-col h-12 justify-center' : 'w-full', (empty || outside) && 'text-muted-foreground')}><span>{grid ? formatMonthLabel(m).split(' ')[0] : formatMonthLabel(m)}</span>{hints[m] && <span className="text-xs text-muted-foreground ml-2">{hints[m]}</span>}</Button>;
  };
  const dateIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const body = custom ? <div className="space-y-3">{mode === 'asat' ? <Calendar mode="single" numberOfMonths={mobile ? 1 : 2} defaultMonth={range?.from} selected={range?.from} onSelect={d => setRange(d ? {from:d,to:d} : undefined)} disabled={[{before:new Date(start+'T00:00:00')},{after:new Date((allowFuture?monthEnd(allowFuture.slice(0,7)):today)+'T23:59:59')}]} /> : <Calendar mode="range" numberOfMonths={mobile ? 1 : 2} defaultMonth={range?.from} selected={range} onSelect={setRange} disabled={[{ before: new Date(start + 'T00:00:00') }, { after: new Date((allowFuture ? monthEnd(allowFuture.slice(0, 7)) : today) + 'T23:59:59') }]} />}<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setRange(undefined)}>Clear</Button><Button disabled={!range?.from || (mode === 'period' && !range.to)} onClick={() => { if (!range?.from) return; choose({ from: dateIso(range.from), to: dateIso(range.to ?? range.from), key: 'custom' }); }}>Apply</Button></div></div> : <><div className={cn('p-2 border-b border-border', mobile ? 'flex flex-wrap gap-2' : 'space-y-1')}>{keys.map(key => <Button key={key} variant="ghost" className={cn('font-normal', !mobile && 'w-full justify-start h-9')} disabled={key !== 'custom' && shortcutSelection(key,today,fiscal).to < start.slice(0,7)+'-01'} onClick={() => shortcut(key)}>{labels[key]}</Button>)}</div><div ref={list} className={cn('relative overflow-y-auto overscroll-contain p-2', mobile ? 'max-h-[48dvh]' : 'max-h-80')}>{years.map(year => <div key={year}><div className="sticky top-0 z-10 bg-popover text-muted-foreground text-xs font-medium py-2">{year}</div>{mobile ? <div className="grid grid-cols-4 gap-1">{Array.from({ length: 12 }, (_, i) => monthButton(`${year}-${String(i + 1).padStart(2, '0')}`, true))}</div> : months.filter(m => m.startsWith(year)).map(m => monthButton(m))}</div>)}</div>{mobile && mode === 'period' && anchor && <div className="p-3 border-t border-border flex justify-end"><Button onClick={() => { selectMonth(anchor); }}>Apply {formatMonthLabel(anchor)}</Button></div>}</>;
  const trigger = <Button variant="secondary" className="h-10 rounded-md gap-2 font-normal max-w-full" aria-label={title} aria-expanded={open}><CalendarDays className="h-4 w-4 shrink-0"/><span className="text-muted-foreground">{title}</span><span className="truncate">{selectionLabel(value, mode, today, fiscal)}</span><ChevronDown className="h-4 w-4 shrink-0"/></Button>;
  return mobile ? <Drawer open={open} onOpenChange={o => { setOpen(o); if (!o) setAnchor(null); }} shouldScaleBackground={false}><DrawerTrigger asChild>{trigger}</DrawerTrigger><DrawerContent className="bg-popover max-h-[90dvh]"><DrawerHeader><DrawerTitle>{title}</DrawerTitle></DrawerHeader>{body}</DrawerContent></Drawer> : <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="start" className={cn('p-0', custom ? 'w-auto' : 'w-72')}>{body}</PopoverContent></Popover>;
}

export function useSharedPeriod(mode: PeriodMode, initial = mode === 'asat' ? 'today' : 'mtd', options: { hints?: Record<string, string>; dataMonths?: string[]; extraShortcuts?: boolean; defaultMonth?: string; allowFuture?: string; financialYear?: boolean } = {}) {
  const books = useBooksWindow(), { user } = useAuth(), preview = usePreviewMode();
  const storageKey = `period-control:${user?.id}:${books.tenantId}:${preview.previewUserId ?? ''}:${mode}`;
  const fiscalStart = options.financialYear ? books.fiscalStart : 1;
  const defaultValue = () => options.defaultMonth ? { ...monthSelection(options.defaultMonth, books.today, mode), to: options.allowFuture && options.defaultMonth > books.today.slice(0,7) ? monthEnd(options.defaultMonth) : monthSelection(options.defaultMonth, books.today, mode).to } : shortcutSelection(initial, books.today, fiscalStart);
  const [value, setValue] = useState<PeriodSelection>(defaultValue), [changed, setChanged] = useState(false);
  useEffect(() => {
    if (!books.data) return;
    let saved: PeriodSelection | undefined;
    try { saved = validSessionSelection(JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'), books.today, books.start, options.allowFuture ? monthEnd(options.allowFuture) : books.today); } catch { /* unavailable session storage */ }
    const next = saved ?? defaultValue();
    setValue({ ...next, from: next.from < books.start ? books.start.slice(0, 7) + '-01' : next.from });
    setChanged(!!saved);
  }, [storageKey, books.today, books.start, fiscalStart, options.defaultMonth, options.allowFuture]);
  const onChange = (next: PeriodSelection) => {
    setValue(next); setChanged(true);
    try { sessionStorage.setItem(storageKey, JSON.stringify({ day: books.today, value: next })); } catch { /* unavailable session storage */ }
  };
  return { value, onChange, changed, booksStart: books.start, month: value.from.slice(0, 7), fromIso: value.from, toIso: value.to, label: selectionLabel(value, mode, books.today, fiscalStart), inPeriod: (date?: string | null) => !!date && date.slice(0, 10) >= value.from && date.slice(0, 10) <= value.to, control: <PeriodControl mode={mode} value={value} onChange={onChange} {...options}/> };
}

export function useFinancePeriod(mode: PeriodMode, initial = mode === 'asat' ? 'today' : 'mtd', options: { hints?: Record<string, string>; dataMonths?: string[]; extraShortcuts?: boolean; defaultMonth?: string } = {}) {
  return useSharedPeriod(mode, initial, { ...options, financialYear: true });
}