import { Skeleton } from "@/components/ui/skeleton";
import { LoadingLines } from "@/components/kit/LoadingSlots";

const card = "kit card-glass rounded-xl p-3 sm:p-4 min-w-0";
export function FinanceOverviewLoading({ month, year }: { month: string; year: number }) {
  return <div role="status" aria-label="Loading Finance overview" className="space-y-5">
    <section className={card}><h2 className="font-display font-semibold mb-4">{month} so far</h2><Skeleton className="h-1 w-full mb-4 !animate-none" /><div className="flex flex-wrap gap-2">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-6 w-32 !animate-none" />)}</div></section>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{['Approve', 'Exceptions', 'Feeds'].map(title => <section key={title} className={`${card} finance-queue`}><div className="flex justify-between items-center mb-3"><h2 className="font-display font-semibold">{title}</h2><Skeleton className="h-8 w-9 !animate-none" /></div><LoadingLines rows={3} /></section>)}</div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{['Profit', 'Money · books'].map(title => <section key={title} className={`${card} finance-metrics`}><h2 className="font-display font-semibold mb-3">{title}</h2><div className="divide-y divide-border">{(title === 'Profit' ? ['Sales','Food & drink','Staff','Running costs','Profit before tax'] : ['Bank','Owed to you','You owe']).map(label=><div key={label} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{label}</span><Skeleton className="h-5 w-24 !animate-none"/></div>)}</div><Skeleton className="h-3 w-3/4 mt-3 !animate-none"/></section>)}</div>
    <section className={card}><h2 className="font-display font-semibold mb-3">Months · {year}</h2><div className="grid grid-cols-3 sm:grid-cols-6 xl:grid-cols-12 gap-2">{Array.from({ length: 12 }, (_, i) => <div key={i} className="bg-muted/50 rounded-md p-3 space-y-2"><Skeleton className="h-5 w-full !animate-none" /><Skeleton className="h-4 w-full !animate-none" /></div>)}</div></section>
  </div>;
}