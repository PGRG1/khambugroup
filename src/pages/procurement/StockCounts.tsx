import { useEffect, useState } from "react";
import { StockTabsRow, CountStockButton } from "@/components/procurement/CountStockButton";
import { shortDay } from "@/utils/salesRecordChecks";
import { formatTableCurrency } from "@/utils/format";
import StockCountScreen from "@/components/procurement/StockCountScreen";
import { useSearchParams } from "react-router-dom";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { Toolbar } from "@/components/kit/Toolbar";
import { FilterPanel, FilterGroup } from "@/components/kit/FilterPanel";
import { SortMenu } from "@/components/kit/SortMenu";
import { formatDate as displayDate, formatCurrency as displayCurrency } from "@/utils/format";
import "@/components/kit/kit.css";
import { supabase } from "@/integrations/supabase/client";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { downloadCSV } from "@/utils/csvDownload";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
} from "lucide-react";

type Session = {
  id: string;
  session_number: string;
  venue: string;
  count_date: string;
  count_type: "full" | "category" | "spot";
  status: "in_progress" | "pending_review" | "approved";
  reference_mode: "none" | "last_count" | "expected";
  notes: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending_review: { label: "To approve", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", cls: "bg-green-50 text-green-700 border-green-200" },
};

export default function StockCounts() {
  const [params, setParams] = useSearchParams();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(params.get("session"));
  const close = () => { setSelectedSessionId(null); setParams({}); };
  return <div className="w-full min-w-0 space-y-5 pb-24">
    <ListView onOpen={setSelectedSessionId} refreshKey={selectedSessionId} />
    <Dialog open={!!selectedSessionId} onOpenChange={o => !o && close()}><DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle className="sr-only">Stock count</DialogTitle></DialogHeader>{selectedSessionId && <DetailView sessionId={selectedSessionId} onBack={close} />}</DialogContent></Dialog>
  </div>;
}

/* ============================================================
 * LIST VIEW
 * ============================================================ */
function ListView({ onOpen, refreshKey }: { onOpen: (id: string) => void; refreshKey: string | null }) {
  const { tenantId } = useActiveTenant();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [itemStats, setItemStats] = useState<Record<string, { total: number; counted: number; value: number }>>({});
  const venueScope = useVenueScope();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");

  const load = async () => {
    if (!tenantId) return;
    const sess = await fetchAllRows("stock_count_sessions", "*", {col:"count_date",asc:false}, tenantId) as Session[];
    setSessions(sess);

    if (sess.length > 0) {
      const items = await fetchAllRows("stock_count_items","session_id, counted_qty, unit_cost",undefined,tenantId);
      const stats: Record<string, { total: number; counted: number; value: number }> = {};
      (items ?? []).forEach((it: any) => {
        const s = (stats[it.session_id] ??= { total: 0, counted: 0, value: 0 });
        s.total += 1;
        if (it.counted_qty != null) {
          s.counted += 1;
          s.value += Number(it.counted_qty) * Number(it.unit_cost || 0);
        }
      });
      setItemStats(stats);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId, refreshKey]);

  const filtered = sessions.filter(
    (s) =>
      venueScope.includesName(s.venue) &&
      (statusFilter === "all" || s.status === statusFilter) && `${s.session_number} ${s.venue}`.toLowerCase().includes(search.toLowerCase())
  ).sort((a,b) => sort === "name" ? a.venue.localeCompare(b.venue) : b.count_date.localeCompare(a.count_date));

  return (
    <>
      <StockTabsRow />
      <RevenuePageTop tabsAbove actionsBesideTitle title="Stock" actions={<CountStockButton />} />
      <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0"><div className="space-y-3"><h2 className="text-base font-display font-semibold px-1">{filtered.length} {filtered.length === 1 ? "count" : "counts"}</h2>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search counts" searchAfterControls mobileSearchBelow filter={<FilterPanel activeCount={statusFilter === "all" ? 0 : 1} onReset={() => setStatusFilter("all")} resultLabel={`Show ${filtered.length} counts`}><FilterGroup title="Status"><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="pending_review">Pending review</SelectItem><SelectItem value="approved">Approved</SelectItem></SelectContent></Select></FilterGroup></FilterPanel>} sort={<SortMenu value={sort} onChange={setSort} options={[{key:"newest",label:"Newest first",compactLabel:"Newest"},{key:"name",label:"Venue"}]} />} onDownload={() => downloadCSV(filtered.map(s => ({number:s.session_number,venue:s.venue,date:s.count_date,type:s.count_type,status:s.status,value:itemStats[s.id]?.value ?? 0})),[{key:"number",label:"Session #"},{key:"venue",label:"Venue"},{key:"date",label:"Date"},{key:"type",label:"Type"},{key:"status",label:"Status"},{key:"value",label:"Value"}],"stock_counts")} /></div>
      {!!filtered.length && <><ul className="min-[641px]:hidden divide-y divide-border/60" aria-label="Stock counts">{filtered.map(s => <li key={s.id}><Button variant="ghost" onClick={() => onOpen(s.id)} className="block w-full h-auto px-2 py-2.5 text-left font-normal hover:bg-transparent"><span className="flex items-baseline justify-between gap-2 text-[14px]"><span className="truncate">{s.venue} · {shortDay(s.count_date)}</span><span className={`shrink-0 text-[13px] ${s.status === "approved" ? "td-num" : "text-muted-foreground"}`}>{s.status === "approved" ? formatTableCurrency(itemStats[s.id]?.value ?? 0) : STATUS_BADGE[s.status].label}</span></span><span className="mt-0.5 block truncate text-[12px] text-muted-foreground td-num">{itemStats[s.id]?.counted ?? 0} of {itemStats[s.id]?.total ?? 0} counted</span></Button></li>)}</ul>
      <div className="kit sales-table-scroll hidden min-[641px]:block"><table className="sales-table !w-full !table-fixed" aria-label="Stock counts"><colgroup><col className="w-[14%]" /><col /><col className="w-[16%]" /><col className="w-[16%]" /><col className="w-[14%]" /><col className="w-[16%]" /></colgroup><thead><tr><th className="sales-cell-left">Date</th><th className="sales-cell-left">Venue</th><th className="sales-cell-left">Count #</th><th className="sales-cell-left">Status</th><th className="sales-cell-right">Counted</th><th className="sales-cell-right">Value</th></tr></thead><tbody>{filtered.map(s => <tr key={s.id} tabIndex={0} onClick={() => onOpen(s.id)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(s.id); } }} className="sales-record-row"><td className="sales-cell-left">{shortDay(s.count_date)}</td><td className="sales-cell-left">{s.venue}</td><td className="sales-cell-left td-num">{s.session_number}</td><td className={`sales-cell-left ${s.status === "approved" ? "" : "text-muted-foreground"}`}>{STATUS_BADGE[s.status].label}</td><td className="sales-cell-right td-num">{itemStats[s.id]?.counted ?? 0}/{itemStats[s.id]?.total ?? 0}</td><td className="sales-cell-right td-num">{s.status === "approved" ? formatTableCurrency(itemStats[s.id]?.value ?? 0) : "—"}</td></tr>)}</tbody></table></div></>}
      {!filtered.length && <p className="p-10 text-center text-sm text-muted-foreground">{search || statusFilter !== "all" ? "Nothing matches your search or filters." : "No stock counts yet."}</p>}</section>
      {showNew && (
        <NewCountDialog
          initialVenue={venueScope.selectedNames.length === 1 ? venueScope.selectedNames[0] : ""}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            onOpen(id);
          }}
        />
      )}
    </>
  );
}

export function NewCountDialog({ onClose, onCreated, initialVenue = "" }: { onClose: () => void; onCreated: (id: string) => void; initialVenue?: string }) {
  const { user } = useAuth();
  const { tenantId } = useActiveTenant();
  const scope = useVenueScope();
  const [venue, setVenue] = useState(initialVenue);
  const [busy, setBusy] = useState(false);
  const [countDate,setCountDate] = useState(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  const names=scope.venues.filter(v=>v.is_active).map(v=>v.name).filter(Boolean);
  useEffect(()=>{if(!venue&&names.length===1)setVenue(names[0]);},[names.join('|'),venue]);
  const submit=async()=>{
    if(!user||!tenantId||!venue)return;
    setBusy(true);
    try {
      const {data,error}=await supabase.from('stock_count_sessions').insert({tenant_id:tenantId,venue,count_date:countDate,count_type:'full',reference_mode:'expected',created_by:user.id}).select('id').single();
      if(error||!data)throw error??new Error('Unable to start count');
      onCreated(data.id);
    } catch(e){toast.error((e as {message?:string})?.message??'Unable to start count');} finally{setBusy(false);}
  };
  return <Dialog open onOpenChange={o=>!o&&!busy&&onClose()}><DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>New stock count</DialogTitle></DialogHeader><div className="space-y-4"><label className="block text-sm">Venue<Select value={venue||undefined} onValueChange={setVenue}><SelectTrigger><SelectValue placeholder="Choose venue"/></SelectTrigger><SelectContent>{names.map(name=><SelectItem value={name} key={name}>{name}</SelectItem>)}</SelectContent></Select></label><label className="block text-sm">Count date<Input type="date" value={countDate} onChange={e=>setCountDate(e.target.value)} /></label></div><DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy||!venue||!countDate} onClick={submit}>{busy?'Starting…':'Start count'}</Button></DialogFooter></DialogContent></Dialog>;
}
export function DetailView({sessionId,onBack}:{sessionId:string;onBack:()=>void}) {
  return <StockCountScreen sessionId={sessionId} onBack={onBack}/>;
}
