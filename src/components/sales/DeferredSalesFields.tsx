import { useFinanceSchedules } from '@/hooks/useFinanceSchedules';
import { enabledDeferredFields } from '@/utils/deferredSales';
import type { SalesRecord } from '@/types/sales';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/utils/format';
export function DeferredSalesFields({ record, onChange }: { record: Partial<SalesRecord>; onChange?: (key: keyof SalesRecord, value: number) => void }) {
  const q = useFinanceSchedules(); const fields = enabledDeferredFields(q.settings);
  if (!fields.length) return null;
  return <section className="space-y-3"><h3 className="text-sm font-medium">Deferred revenue</h3><div className="grid grid-cols-2 gap-3">{fields.map(([key, label]) => <div key={key} className="min-w-0 space-y-1"><Label htmlFor={`deferred-${key}`}>{label}</Label>{onChange ? <Input id={`deferred-${key}`} type="number" min="0" step="0.01" value={record[key] ?? ''} onChange={e => onChange(key, Number(e.target.value))} /> : <p className="td-num text-sm">{formatCurrency(Number(record[key] ?? 0))}</p>}</div>)}</div></section>;
}