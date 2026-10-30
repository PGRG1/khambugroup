import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenueScope } from "@/hooks/useVenueScope";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScanLine, Download, Columns3, ChevronLeft, ChevronRight } from "lucide-react";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import DateFilter from "@/components/dashboard/DateFilter";
import { Toolbar, FilterPanel, FilterGroup, SortMenu } from "@/components/kit";
import { mtdRange } from "@/components/revenue-overview/utils";
import { monthSoFarLabel, iso } from "@/utils/revenueOverview";
import { shortDay } from "@/utils/salesRecordChecks";
import { formatDate, formatDecimal, formatTableInteger, formatTableCurrency, formatMonthLabel } from "@/utils/format";
import { downloadCSV } from "@/utils/csvDownload";
import { usePagination } from "@/components/common/data-table";
import ProcurementInvoicesTab, { type InvoiceWorkflowControls } from "./ProcurementInvoicesTab";
import { buildRegisterItems, filterRegisterLines, type PurchaseRegisterLine, type PurchaseRegisterItem } from "@/utils/purchaseRegister";

export default function ProcurementLineItemsTab() {
  return <ProcurementInvoicesTab renderRegister={controls => <PurchaseRegister controls={controls} />} />;
}

function PurchaseRegister({ controls }: { controls: InvoiceWorkflowControls }) {
  const { tenantId } = useActiveTenant();
  const scope = useVenueScope();
  const navigate = useNavigate();
  const [rows,setRows] = useState<PurchaseRegisterLine[]>([]);
  const [loading,setLoading] = useState(true);
  const [search,setSearch] = useState("");
  const [supplier,setSupplier] = useState("all");
  const [notLinked,setNotLinked] = useState(false);
  const [view,setView] = useState<"lines"|"items">("lines");
  const [period,setPeriod] = useState("MTD");
  const [from,setFrom] = useState<Date|undefined>(()=>mtdRange().from);
  const [to,setTo] = useState<Date|undefined>(()=>mtdRange().to);
  const [lineSort,setLineSort] = useState("newest");
  const [itemSort,setItemSort] = useState("spent");
  const [columns,setColumns] = useState<string[]>([]);
  const [selectedItem,setSelectedItem] = useState<PurchaseRegisterItem|null>(null);
  const fetchRows = useCallback(async () => {
    if (!tenantId) { setRows([]); setLoading(false); return; }
    try {
      const [lines,invoices,suppliers,products] = await Promise.all([
        fetchAllRows("invoice_line_items","*",{col:"created_at",asc:false},tenantId),
        fetchAllRows("invoices","id, invoice_number, invoice_date, supplier_id, venue, file_url",undefined,tenantId),
        fetchAllRows("suppliers","id, name",undefined,tenantId),
        fetchAllRows("product_master","id, internal_product_name, internal_sku, external_sku, purchase_unit",undefined,tenantId),
      ]);
      const invoiceMap = new Map(invoices.map((invoice:any)=>[invoice.id,invoice]));
      const supplierMap = new Map(suppliers.map((entry:any)=>[entry.id,entry.name]));
      const productMap = new Map(products.map((entry:any)=>[entry.id,entry]));
      setRows(lines.flatMap((line:any) => {
        const invoice:any = invoiceMap.get(line.invoice_id);
        if (!invoice) return [];
        const productId = line.product_master_id || line.standard_product_id || null;
        const product:any = productId ? productMap.get(productId) : null;
        return [{id:line.id,invoice_id:line.invoice_id,invoice_number:invoice.invoice_number || "",invoice_date:invoice.invoice_date || "",venue:invoice.venue || "",supplier_name:String(supplierMap.get(invoice.supplier_id) || "Unknown"),description:line.description || "",quantity:Number(line.quantity)||0,unit:line.unit || "",purchase_unit:product?.purchase_unit || "",unit_price:Number(line.unit_price)||0,total:Number(line.total)||0,product_id:productId,master_name:product?.internal_product_name || "",internal_sku:product?.internal_sku || "",external_sku:line.item_code?.trim() || product?.external_sku || "",file_url:invoice.file_url || ""}];
      }));
    } finally { setLoading(false); }
  },[tenantId]);
  useEffect(()=>{ void fetchRows(); },[fetchRows]);
  useEffect(()=>{
    if (!tenantId) return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const refresh = () => { if(timer) clearTimeout(timer); timer=setTimeout(()=>void fetchRows(),300); };
    const channel = supabase.channel(`purchase-register-${tenantId}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"invoice_line_items",filter:`tenant_id=eq.${tenantId}`},refresh)
      .on("postgres_changes",{event:"*",schema:"public",table:"invoices",filter:`tenant_id=eq.${tenantId}`},refresh).subscribe();
    return ()=>{if(timer) clearTimeout(timer); void supabase.removeChannel(channel);};
  },[tenantId,fetchRows]);
  const months = useMemo(()=>[...new Set(rows.map(row=>row.invoice_date.slice(0,7)).filter(Boolean))].sort().reverse(),[rows]);
  const monthName = formatMonthLabel;
  const periodName = period === "MTD" ? monthSoFarLabel() : period === "all" ? "All time" : period === "custom" ? "Selected dates" : monthName(period);
  const filtered = useMemo(()=>filterRegisterLines(rows,{from:from ? iso(from):undefined,to:to ? iso(to):undefined,supplier,notLinked,search,includesVenue:scope.includesName}),[rows,from,to,supplier,notLinked,search,scope.includesName]);
  const history = useMemo(()=>rows.filter(row=>scope.includesName(row.venue)),[rows,scope.includesName]);
  const items = useMemo(()=>buildRegisterItems(filtered,history,from ? iso(from):undefined).sort((a,b)=>itemSort === "name" ? a.name.localeCompare(b.name) : itemSort === "change" ? Math.abs(b.change ?? 0)-Math.abs(a.change ?? 0) : b.spent-a.spent),[filtered,history,from,itemSort]);
  const sortedLines = useMemo(()=>[...filtered].sort((a,b)=>lineSort === "name" ? (a.master_name||a.description).localeCompare(b.master_name||b.description) : lineSort === "amount" ? b.total-a.total : lineSort === "oldest" ? a.invoice_date.localeCompare(b.invoice_date) : b.invoice_date.localeCompare(a.invoice_date)),[filtered,lineSort]);
  const pag = usePagination(sortedLines,50);
  const itemPag = usePagination(items,50);
  useEffect(()=>{pag.setPage(1);itemPag.setPage(1);},[search,supplier,notLinked,from,to,scope.label,view,lineSort,itemSort]);
  const total = filtered.reduce((sum,row)=>sum+row.total,0);
  const unlinked = filtered.filter(row=>!row.product_id);
  const suppliers = [...new Set(rows.map(row=>row.supplier_name).filter(Boolean))].sort();
  const extraColumns = [{key:"invoice_number",label:"Invoice #"},{key:"internal_sku",label:"Internal SKU"},{key:"external_sku",label:"External SKU"}].filter(column=>columns.includes(column.key));
  const qty = (quantity:number,unit:string) => `${formatDecimal(quantity,Number.isInteger(quantity)?0:2)} ${unit}`.trim();
  const changeText = (item:PurchaseRegisterItem) => item.freeQuantity > 0 ? `${formatDecimal(item.freeQuantity,Number.isInteger(item.freeQuantity)?0:2)} free at 0.00` : item.change == null ? "—" : Math.abs(item.change)<0.5 ? "No change" : `${item.change>0?"Up":"Down"} ${formatTableInteger(Math.abs(item.change))}%`;
  const showUnlinked = () => {setView("lines");setNotLinked(true);setSearch("");};
  const download = () => downloadCSV(sortedLines.map(row=>({invoice_date:formatDate(row.invoice_date),supplier_name:row.supplier_name,invoice_number:row.invoice_number,internal_sku:row.internal_sku,external_sku:row.external_sku,master_name:row.master_name,description:row.description,quantity:row.quantity,unit:row.unit,unit_price:row.unit_price.toFixed(2),total:row.total.toFixed(2)})),[{key:"invoice_date",label:"Date"},{key:"supplier_name",label:"Supplier & Vendor"},{key:"invoice_number",label:"Invoice #"},{key:"internal_sku",label:"Internal SKU"},{key:"external_sku",label:"External SKU"},{key:"master_name",label:"Internal Product Name"},{key:"description",label:"Supplier Product Name"},{key:"quantity",label:"Qty"},{key:"unit",label:"Unit"},{key:"unit_price",label:"Unit Price"},{key:"total",label:"Net Amount"}],"invoice_line_items");
  const segmented = <div className="kit-seg shrink-0" aria-label="Register view">{([['lines','Lines'],['items','By item']] as const).map(([key,label])=><Button key={key} variant="ghost" className="!h-8 !min-h-8 !px-2" aria-pressed={view===key} onClick={()=>setView(key)}>{label}</Button>)}</div>;
  const filter = <FilterPanel activeCount={Number(supplier!=="all")+Number(notLinked)} onReset={()=>{setSupplier("all");setNotLinked(false);}} width={340}>
    <FilterGroup title="Supplier"><Select value={supplier} onValueChange={setSupplier}><SelectTrigger aria-label="Supplier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.map(name=><SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></FilterGroup>
    <FilterGroup title="Venue"><p className="text-[13px] text-muted-foreground">{scope.label}</p><div className="flex flex-wrap gap-1.5">{scope.venues.map(venue=><Button key={venue.id} variant="outline" size="sm" aria-pressed={scope.includesId(venue.id)} onClick={()=>scope.toggleVenue(venue.id)}>{venue.name}</Button>)}</div></FilterGroup>
    <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={notLinked} onCheckedChange={checked=>setNotLinked(checked===true)} />Not linked to an item</label>
    <div className="min-[641px]:hidden"><FilterGroup title="Sort"><SortMenu value={view==="lines"?lineSort:itemSort} onChange={view==="lines"?setLineSort:setItemSort} options={view==="lines"?[{key:"newest",label:"Newest first"},{key:"oldest",label:"Oldest first"},{key:"amount",label:"Amount: highest first"},{key:"name",label:"Item A–Z"}]:[{key:"spent",label:"Most spent"},{key:"change",label:"Biggest change"},{key:"name",label:"Item A–Z"}]} /></FilterGroup></div>
  </FilterPanel>;
  const lineName = (row:PurchaseRegisterLine) => <><span className="block break-words">{row.master_name||row.description||"—"}</span>{row.master_name && row.description.trim().toLowerCase()!==row.master_name.trim().toLowerCase() && <span className="block mt-0.5 text-xs text-muted-foreground break-words">{row.description}</span>}{!row.product_id && <span className="block text-xs text-warning">Not linked</span>}</>;
  const rowKeys = (open:()=>void) => ({tabIndex:0,onClick:open,onKeyDown:(event:React.KeyboardEvent)=>{if(event.target===event.currentTarget&&(event.key==="Enter"||event.key===" ")){event.preventDefault();open();}}});
  return <div className="space-y-6 min-w-0 max-[640px]:pb-24">
    <RevenuePageTop title="Purchase Register" actionsBesideTitle actions={<Button onClick={controls.upload} className="h-9 px-3 min-[641px]:h-10"><ScanLine className="h-4 w-4 mr-1.5"/><span className="min-[641px]:hidden">Upload</span><span className="max-[640px]:hidden">Upload invoice</span></Button>} period={<DateFilter labelled includeMtd initialPeriod="MTD" from={from} to={to} onFromChange={date=>{setPeriod("custom");setFrom(date);}} onToChange={date=>{setPeriod("custom");setTo(date);}} months={months.map(monthName)} onPeriodSelect={selection=>{if(selection==="MTD"){const range=mtdRange();setPeriod("MTD");setFrom(range.from);setTo(range.to);}else if(selection==="All Time"){setPeriod("all");setFrom(undefined);setTo(undefined);}else {const month=months.find(value=>monthName(value)===selection);if(month){setPeriod(month);const [year,m]=month.split("-").map(Number);setFrom(new Date(year,m-1,1));setTo(new Date(year,m,0));}}}}/>}/>
    <div data-invoice-tabs-host />
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Purchase Register records">
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5" aria-label="Purchase Register summary"><span>{periodName}</span><span className="text-[13px] text-muted-foreground font-normal">· {formatTableInteger(filtered.length)} lines · {formatTableCurrency(total)} · {formatTableInteger(new Set(filtered.map(row=>row.supplier_name)).size)} suppliers</span>{unlinked.length>0&&<span className="text-[13px] text-warning font-normal">· {formatTableInteger(unlinked.length)} not linked</span>}</h2>
      <Toolbar mobileSearchBelow searchAfterControls search={search} onSearch={setSearch} placeholder="Search item, invoice # or supplier" filter={<>{segmented}{filter}</>} sort={<div className="max-[640px]:hidden"><SortMenu value={view==="lines"?lineSort:itemSort} onChange={view==="lines"?setLineSort:setItemSort} options={view==="lines"?[{key:"newest",label:"Newest first"},{key:"oldest",label:"Oldest first"},{key:"amount",label:"Highest amount"},{key:"name",label:"Item A–Z"}]:[{key:"spent",label:"Most spent"},{key:"change",label:"Biggest change"},{key:"name",label:"Item A–Z"}]}/></div>} columns={view==="lines"&&<div className="max-[640px]:hidden"><Popover><PopoverTrigger asChild><Button variant="outline" className="kit-btn kit-tool-btn" aria-label="Columns"><Columns3 className="h-4 w-4"/>Columns</Button></PopoverTrigger><PopoverContent className="w-52 space-y-3">{[{key:"invoice_number",label:"Invoice #"},{key:"internal_sku",label:"Internal SKU"},{key:"external_sku",label:"External SKU"}].map(column=><label key={column.key} className="flex items-center gap-2 text-sm"><Checkbox checked={columns.includes(column.key)} onCheckedChange={checked=>setColumns(previous=>checked?[...previous,column.key]:previous.filter(key=>key!==column.key))}/>{column.label}</label>)}</PopoverContent></Popover></div>} downloadControl={<Button variant="outline" size="icon" className="kit-btn kit-tool-btn kit-btn-icon" aria-label="Download Purchase Register" title="Download CSV" onClick={download}><Download className="h-4 w-4"/></Button>}/>
      {loading ? <p className="p-10 text-center text-sm text-muted-foreground">Loading purchase lines…</p> : !filtered.length ? <p className="p-10 text-center text-sm text-muted-foreground">No purchases match this period and filters.</p> : view==="lines" ? <>
        <ul className="min-[641px]:hidden divide-y divide-border/60" aria-label="Purchase lines">{pag.pageItems.map(row=><li key={row.id} className="px-2 py-3"><Button variant="ghost" className="block w-full h-auto p-0 text-left font-normal hover:bg-transparent" onClick={()=>controls.openInvoice(row.invoice_id)}><span className="flex justify-between gap-2"><span className="min-w-0 flex-1 whitespace-normal text-[13px]">{lineName(row)}</span><span className="td-num shrink-0 text-[13px]">{formatTableCurrency(row.total)}</span></span><span className="block mt-1 text-xs text-muted-foreground whitespace-normal">{shortDay(row.invoice_date)} · {row.supplier_name} · <span className="td-num">{qty(row.quantity,row.unit)} × {formatDecimal(row.unit_price)}</span></span></Button></li>)}</ul>
        <div className="kit hidden min-[641px]:block"><table className="sales-table !w-full !table-fixed" aria-label="Purchase lines"><thead><tr><th className="sales-cell-left w-[12%]">Date</th><th className="sales-cell-left">Item</th><th className="sales-cell-left w-[20%]">Supplier</th>{extraColumns.map(column=><th className="sales-cell-left w-[10%]" key={column.key}>{column.label}</th>)}<th className="sales-cell-right w-[11%]">Qty</th><th className="sales-cell-right w-[10%]">Price</th><th className="sales-cell-right w-[12%]">Amount</th></tr></thead><tbody>{pag.pageItems.map(row=><tr key={row.id} className="sales-record-row" {...rowKeys(()=>controls.openInvoice(row.invoice_id))}><td className="sales-cell-left !whitespace-normal">{shortDay(row.invoice_date)}</td><td className="sales-cell-left !whitespace-normal">{lineName(row)}</td><td className="sales-cell-left !whitespace-normal break-words">{row.supplier_name}</td>{extraColumns.map(column=><td className="sales-cell-left td-num !whitespace-normal break-all" key={column.key}>{row[column.key as "invoice_number"|"internal_sku"|"external_sku"]||"—"}</td>)}<td className="td-num !whitespace-normal">{qty(row.quantity,row.unit)}</td><td className="td-num">{formatDecimal(row.unit_price)}</td><td className="td-num">{formatTableCurrency(row.total)}</td></tr>)}</tbody><tfoot><tr className="border-t border-border font-semibold"><td colSpan={5+extraColumns.length} className="sales-cell-left">Total</td><td className="td-num">{formatTableCurrency(total)}</td></tr></tfoot></table></div>
        <div className="min-[641px]:hidden border-t border-border pt-3 flex justify-between text-[13px] font-semibold"><span>Total</span><span className="td-num">{formatTableCurrency(total)}</span></div>
      </> : <>
        <ul className="min-[641px]:hidden divide-y divide-border/60" aria-label="Purchased items">{itemPag.pageItems.map(item=><li key={item.key} className="px-2 py-3"><Button variant="ghost" className="block w-full h-auto p-0 text-left font-normal hover:bg-transparent" onClick={()=>setSelectedItem(item)}><span className="flex justify-between gap-2 text-[13px]"><span className="min-w-0 whitespace-normal">{item.name}</span><span className="td-num shrink-0">{formatTableCurrency(item.spent)}</span></span><span className="block mt-1 text-xs text-muted-foreground whitespace-normal">{shortDay(item.lines[0].invoice_date)} · {item.supplier} · <span className="td-num">{qty(item.quantity,item.unit)} × {formatDecimal(item.lastPrice)}</span></span><span className={`block text-xs mt-1 ${item.freeQuantity>0?"text-warning":"text-muted-foreground"}`}>{changeText(item)}</span></Button></li>)}</ul>
        <div className="kit hidden min-[641px]:block"><table className="sales-table !w-full !table-fixed" aria-label="Purchased items"><thead><tr><th className="sales-cell-left w-[32%]">Item</th><th className="sales-cell-right">Bought</th><th className="sales-cell-right">Last price</th><th className="sales-cell-right">Usual price</th><th className="sales-cell-left">Change</th><th className="sales-cell-right">Spent</th></tr></thead><tbody>{itemPag.pageItems.map(item=><tr key={item.key} className="sales-record-row" {...rowKeys(()=>setSelectedItem(item))}><td className="sales-cell-left !whitespace-normal"><span className="block">{item.name}</span><span className="block text-xs text-muted-foreground mt-0.5">{item.supplier}</span></td><td className="td-num !whitespace-normal">{qty(item.quantity,item.unit)}</td><td className="td-num">{formatDecimal(item.lastPrice)}</td><td className="td-num">{item.usualPrice==null?"—":formatDecimal(item.usualPrice)}</td><td className={`sales-cell-left !whitespace-normal ${item.freeQuantity>0?"text-warning":""}`}>{changeText(item)}</td><td className="td-num">{formatTableCurrency(item.spent)}</td></tr>)}</tbody></table></div>
        {unlinked.length>0&&<Button variant="ghost" className="w-full justify-between text-warning text-[13px] whitespace-normal h-auto py-3" onClick={showUnlinked}><span>Not linked to an item ({formatTableInteger(unlinked.length)} lines)</span><span className="td-num">{formatTableCurrency(unlinked.reduce((sum,row)=>sum+row.total,0))}</span></Button>}
      </>}
      {(view==="lines"?pag:itemPag).totalPages>1&&<div className="flex justify-between items-center gap-2 kit-divider pt-2 text-xs text-muted-foreground"><span className="td-num">{formatTableInteger((view==="lines"?pag:itemPag).rangeStart)}–{formatTableInteger((view==="lines"?pag:itemPag).rangeEnd)} of {formatTableInteger((view==="lines"?pag:itemPag).total)}</span><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Previous page" className="h-8 w-8" disabled={(view==="lines"?pag:itemPag).page<=1} onClick={()=>{const current=view==="lines"?pag:itemPag;current.setPage(current.page-1);}}><ChevronLeft className="h-4 w-4"/></Button><Button variant="ghost" size="icon" aria-label="Next page" className="h-8 w-8" disabled={(view==="lines"?pag:itemPag).page>=(view==="lines"?pag:itemPag).totalPages} onClick={()=>{const current=view==="lines"?pag:itemPag;current.setPage(current.page+1);}}><ChevronRight className="h-4 w-4"/></Button></div></div>}
    </section>
    <Dialog open={!!selectedItem} onOpenChange={open=>{if(!open)setSelectedItem(null);}}><DialogContent className="kit sales-day-dialog bg-background max-w-[760px] grid-cols-[minmax(0,1fr)] p-0 gap-0 w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] rounded-lg overflow-y-auto">{selectedItem&&<div className="min-w-0 p-5 sm:p-7 space-y-5"><div className="pr-8 space-y-1.5"><DialogTitle className="text-[16px] break-words">{selectedItem.name}</DialogTitle><DialogDescription className="text-[13px]">{selectedItem.supplier} · {periodName}</DialogDescription></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">{[["Bought",qty(selectedItem.quantity,selectedItem.unit)],["Spent",formatTableCurrency(selectedItem.spent)],["Paid price",selectedItem.paidPrice==null?"—":formatDecimal(selectedItem.paidPrice)],["Per unit overall",selectedItem.overallPrice==null?"—":formatDecimal(selectedItem.overallPrice)]].map(([label,value])=><div key={label} className="min-w-0"><p className="kit-group-h mb-1">{label}</p><p className="td-num break-words">{value}</p></div>)}</div>{selectedItem.freeQuantity>0&&<p className="text-[13px] text-warning">Includes {formatDecimal(selectedItem.freeQuantity,Number.isInteger(selectedItem.freeQuantity)?0:2)} free units at 0.00, so real cost per unit is {selectedItem.overallPrice==null?"—":formatDecimal(selectedItem.overallPrice)}</p>}
      <table className="w-full table-fixed text-[12px]" aria-label="Item purchase lines"><thead><tr className="border-b border-border text-muted-foreground"><th className="text-left w-[22%] py-3">Date</th><th className="text-left w-[27%]">Invoice #</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead><tbody>{selectedItem.lines.map(row=><tr key={row.id} className="border-b border-border/50"><td className="py-3 pr-1">{shortDay(row.invoice_date)}</td><td className="pr-1 break-all"><Button variant="link" className="p-0 h-auto text-xs whitespace-normal text-left break-all" onClick={()=>{setSelectedItem(null);controls.openInvoice(row.invoice_id);}}>{row.invoice_number}</Button></td><td className="text-right td-num">{formatDecimal(row.quantity,Number.isInteger(row.quantity)?0:2)}</td><td className="text-right td-num">{formatDecimal(row.unit_price)}</td><td className="text-right td-num">{formatDecimal(row.total)}</td></tr>)}</tbody></table>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" className="kit-btn kit-btn-secondary" onClick={()=>navigate("/procurement/products")}>Open in Items Master</Button><Button className="kit-btn kit-btn-primary" onClick={()=>{const invoiceId=selectedItem.lines[0]?.invoice_id;setSelectedItem(null);if(invoiceId)controls.openInvoice(invoiceId);}}>Open invoice</Button></div></div>}</DialogContent></Dialog>
  </div>;
}
