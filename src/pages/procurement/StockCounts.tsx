import { useEffect, useState } from "react";
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
  in_progress: { label: "In Progress", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending_review: { label: "Pending Review", cls: "bg-blue-50 text-blue-700 border-blue-200" },
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
      <RevenuePageTop title="Stock" actionsBesideTitle actions={<Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4" />Count stock</Button>} />
      <div data-invoice-tabs-host />
      <section className="kit card-glass overflow-hidden"><div className="p-4 sm:p-5 space-y-3"><h2 className="text-base font-semibold">Counts</h2><p className="text-sm text-muted-foreground">{filtered.length} stock counts</p>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search counts" searchAfterControls mobileSearchBelow filter={<FilterPanel activeCount={statusFilter === "all" ? 0 : 1} onReset={() => setStatusFilter("all")} resultLabel={`Show ${filtered.length} counts`}><FilterGroup title="Status"><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="pending_review">Pending review</SelectItem><SelectItem value="approved">Approved</SelectItem></SelectContent></Select></FilterGroup></FilterPanel>} sort={<SortMenu value={sort} onChange={setSort} options={[{key:"newest",label:"Newest first",compactLabel:"Newest"},{key:"name",label:"Venue"}]} />} onDownload={() => downloadCSV(filtered.map(s => ({number:s.session_number,venue:s.venue,date:s.count_date,type:s.count_type,status:s.status,value:itemStats[s.id]?.value ?? 0})),[{key:"number",label:"Session #"},{key:"venue",label:"Venue"},{key:"date",label:"Date"},{key:"type",label:"Type"},{key:"status",label:"Status"},{key:"value",label:"Value"}],"stock_counts")} /></div>
      <table className="hidden min-[641px]:table w-full table-fixed text-sm"><thead className="text-xs text-muted-foreground border-y"><tr>{["Count", "Venue", "Date", "Type", "Status", "Progress", "Value"].map(h => <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{filtered.map(s => <tr key={s.id} onClick={() => onOpen(s.id)} className="border-b cursor-pointer hover:bg-muted/40"><td className="px-3 py-3 break-words">{s.session_number}</td><td className="px-3 break-words">{s.venue}</td><td className="px-3">{displayDate(s.count_date)}</td><td className="px-3 capitalize">{s.count_type}</td><td className="px-3">{STATUS_BADGE[s.status].label}</td><td className="px-3 td-num">{itemStats[s.id]?.counted ?? 0}/{itemStats[s.id]?.total ?? 0}</td><td className="px-3 td-num">{s.status === "approved" ? displayCurrency(itemStats[s.id]?.value ?? 0) : "—"}</td></tr>)}</tbody></table>
      <div className="min-[641px]:hidden divide-y divide-border">{filtered.map(s => <Button key={s.id} variant="ghost" onClick={() => onOpen(s.id)} className="block w-full h-auto rounded-none p-4 text-left whitespace-normal"><div className="font-medium">{s.venue} · {s.session_number}</div><div className="text-xs text-muted-foreground mt-1">{displayDate(s.count_date)} · {s.count_type} · {STATUS_BADGE[s.status].label}</div><div className="text-xs text-muted-foreground mt-1">{itemStats[s.id]?.counted ?? 0}/{itemStats[s.id]?.total ?? 0} counted</div></Button>)}</div>
      {!filtered.length && <p className="text-center p-8 text-sm text-muted-foreground">No stock counts yet.</p>}</section>
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
