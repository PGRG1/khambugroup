import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PeriodControl, useSharedPeriod } from './PeriodControl';
import { useBooksWindow } from '@/hooks/useBooksWindow';
import { formatMonthLabel } from '@/utils/format';
import { periodMonths } from '@/utils/periodWindow';

export type ViewMode = 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
export interface PeriodOption { id: string; label: string; months: number[]; year: number }
export function getOptionsForView(view: ViewMode, year: number): PeriodOption[] {
  const size = view === 'monthly' ? 1 : view === 'quarterly' ? 3 : view === 'semi-annual' ? 6 : 12;
  return Array.from({length: 12 / size}, (_, i) => ({
    id: size === 1 ? `${year}-${i+1}` : size === 3 ? `${year}-Q${i+1}` : size === 6 ? `${year}-H${i+1}` : String(year),
    label: size === 1 ? formatMonthLabel(`${year}-${String(i+1).padStart(2,'0')}`) : size === 3 ? `Q${i+1} ${year}` : size === 6 ? `H${i+1} ${year}` : String(year),
    months: Array.from({length: size}, (_, j) => i * size + j + 1), year,
  }));
}
export function getDefaultPeriod(view: ViewMode): PeriodOption[] {
  const today = new Date(), month = today.getMonth()+1;
  return getOptionsForView(view, today.getFullYear()).filter(p => p.months.includes(month));
}
export function boundComparePeriods(periods: PeriodOption[], start: string, today: string) {
  const allowed = new Set(periodMonths(start,today));
  return periods.flatMap(p => {
    const months = p.months.filter(m => allowed.has(`${p.year}-${String(m).padStart(2,'0')}`));
    return months.length ? [{...p,months}] : [];
  });
}
export function PeriodCompare({viewMode,selectedPeriods,onViewModeChange,onPeriodsChange}: {viewMode: ViewMode; selectedPeriods: PeriodOption[]; onViewModeChange: (v: ViewMode)=>void; onPeriodsChange: (p: PeriodOption[])=>void}) {
  const books = useBooksWindow(), selection = useSharedPeriod('period', 'last-month', {financialYear: true,extraShortcuts:true});
  const [comparing,setComparing] = useState(false);
  useEffect(() => {
    if (!books.data) return;
    const bounded = boundComparePeriods(selectedPeriods,books.start,books.today);
    if (JSON.stringify(bounded) !== JSON.stringify(selectedPeriods)) onPeriodsChange(bounded);
  },[books.start,books.today,books.data,selectedPeriods]);
  const add = (value: typeof selection.value, replace = false) => {
    selection.onChange(value);
    const months = periodMonths(value.from,value.to).reverse();
    const options = [...new Set(months.map(m=>Number(m.slice(0,4))))].flatMap(y=>getOptionsForView(viewMode,y)).filter(p=>p.months.some(m=>months.includes(`${p.year}-${String(m).padStart(2,'0')}`))).map(p=>({...p,months:p.months.filter(m=>months.includes(`${p.year}-${String(m).padStart(2,'0')}`))}));
    onPeriodsChange(boundComparePeriods(replace ? options : [...selectedPeriods.filter(p=>!options.some(o=>o.id===p.id)),...options],books.start,books.today));
  };
  return <div className="flex flex-wrap items-center gap-2 min-w-0"><div className="kit-seg">{(['monthly','quarterly','semi-annual','annual'] as const).map(v=><Button key={v} variant="ghost" aria-pressed={viewMode===v} onClick={()=>onViewModeChange(v)}>{v==='monthly'?'Month':v==='quarterly'?'Quarter':v==='semi-annual'?'Half-year':'Year'}</Button>)}</div><PeriodControl mode="period" value={selection.value} onChange={v=>{add(v,!comparing);setComparing(false);}} financialYear extraShortcuts/><Button variant={comparing?'secondary':'outline'} size="icon" aria-label="Add comparison period" title="Add comparison period" aria-pressed={comparing} onClick={()=>setComparing(!comparing)}><Plus className="h-4 w-4"/></Button>{selectedPeriods.map(p=><Button key={p.id} variant="secondary" className="h-8 max-w-full" onClick={()=>onPeriodsChange(selectedPeriods.filter(o=>o.id!==p.id))}>{p.label}<X className="h-3 w-3 ml-1"/></Button>)}</div>;
}