import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Eye, Search, Download, FileStack, Paperclip, MoreHorizontal } from "lucide-react";
import { useInvoiceData, Invoice, InvoiceLineItem } from "@/hooks/useInvoiceData";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { downloadCSV } from "@/utils/csvDownload";
import { cn } from "@/lib/utils";

const fmt = (n: number) => `HK$ ${(n || 0).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
};

// Tokenized status tones: paid/approved → primary; overdue → destructive; pending/partial → warning; cancelled/verified → muted/info.
const STATUS_TONE: Record<string, string> = {
  pending: "bg-warning/10 text-warning border border-warning/20",
  verified: "bg-info/10 text-info border border-info/20",
  approved: "bg-primary/10 text-primary border border-primary/20",
  paid: "bg-primary/10 text-primary border border-primary/20",
  partial: "bg-warning/10 text-warning border border-warning/20",
  overdue: "bg-destructive/10 text-destructive border border-destructive/20",
  cancelled: "bg-muted text-muted-foreground border border-border",
};
const statusTone = (s: string) => STATUS_TONE[s] || "bg-muted text-muted-foreground border border-border";

export default function DocumentsBills() {
  const { invoices, suppliers, loading, fetchLineItems } = useInvoiceData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    (suppliers || []).forEach((s) => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (invoices || []).filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (!s) return true;
      const sup = (supplierMap.get(inv.supplier_id) || "").toLowerCase();
      return sup.includes(s) || inv.invoice_number.toLowerCase().includes(s);
    });
  }, [invoices, search, statusFilter, supplierMap]);

  const openDetails = async (inv: Invoice) => {
    setSelected(inv);
    setSheetOpen(true);
    const items = await fetchLineItems(inv.id);
    setLineItems(items || []);
  };

  const openAttachment = (url: string) => {
    setViewerUrl(url);
    setViewerOpen(true);
  };

  const exportCSV = () => {
    const rows = filtered.map((inv) => ({
      vendor: supplierMap.get(inv.supplier_id) || "",
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date || "",
      amount: inv.total_amount,
      status: inv.status,
      file_name: inv.file_name || "",
    }));
    downloadCSV(rows, [
      { key: "vendor", label: "Vendor" },
      { key: "invoice_number", label: "Invoice Number" },
      { key: "invoice_date", label: "Invoice Date" },
      { key: "due_date", label: "Due Date" },
      { key: "amount", label: "Amount" },
      { key: "status", label: "Status" },
      { key: "file_name", label: "File Name" },
    ], "documents-bills");
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileStack className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Documents & Bills</h1>
            <p className="text-sm text-muted-foreground mt-1">Finance-owned view of invoices and bills.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="h-9 gap-2">
          <Download className="h-4 w-4" /> CSV
        </Button>
      </header>

      <p className="text-xs text-muted-foreground -mt-2">
        {loading ? "Loading…" : `${filtered.length} of ${(invoices || []).length} bills`}
      </p>

      <Card className="card-glass p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vendor or invoice #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Desktop table */}
      <Card className="card-glass p-0 overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`s-${i}`}><TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No bills found.</TableCell></TableRow>
              )}
              {!loading && filtered.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{supplierMap.get(inv.supplier_id) || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(inv.invoice_date)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDate(inv.due_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(inv.total_amount)}</TableCell>
                  <TableCell>
                    <span className={cn("text-[10px] uppercase px-2 py-0.5 rounded-full tracking-wide", statusTone(inv.status))}>
                      {inv.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {inv.file_url ? (
                      <Button variant="ghost" size="sm" className="gap-1.5 h-9 text-xs" onClick={() => openAttachment(inv.file_url!)}>
                        <Paperclip className="h-3.5 w-3.5 text-primary" /> View
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-9 min-w-[44px]" onClick={() => openDetails(inv)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile list */}
      <div className="md:hidden space-y-3">
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <Card key={`ms-${i}`} className="card-glass p-4"><Skeleton className="h-20 w-full" /></Card>
        ))}
        {!loading && filtered.length === 0 && (
          <Card className="card-glass p-6 text-center text-sm text-muted-foreground">No bills found.</Card>
        )}
        {!loading && filtered.map((inv) => (
          <Card key={inv.id} className="card-glass p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-[10px] uppercase px-2 py-0.5 rounded-full tracking-wide", statusTone(inv.status))}>{inv.status}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">#{inv.invoice_number}</span>
                </div>
                <div className="text-sm font-medium mt-1 truncate">{supplierMap.get(inv.supplier_id) || "—"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {fmtDate(inv.invoice_date)}{inv.due_date && <> · due {fmtDate(inv.due_date)}</>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{fmt(inv.total_amount)}</div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-9 w-9 mt-1 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openDetails(inv)}>
                      <Eye className="h-4 w-4 mr-2" /> Details
                    </DropdownMenuItem>
                    {inv.file_url && (
                      <DropdownMenuItem onClick={() => openAttachment(inv.file_url!)}>
                        <Paperclip className="h-4 w-4 mr-2" /> View source
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selected ? `${supplierMap.get(selected.supplier_id) || ""} · #${selected.invoice_number}` : "Bill details"}
            </SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoice Date</div><div>{fmtDate(selected.invoice_date)}</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Due Date</div><div>{fmtDate(selected.due_date)}</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Subtotal</div><div className="tabular-nums">{fmt(selected.subtotal)}</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tax</div><div className="tabular-nums">{fmt(selected.tax_amount)}</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Discount</div><div className="tabular-nums">{fmt(selected.discount)}</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div><div className="tabular-nums font-semibold">{fmt(selected.total_amount)}</div></div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Line items</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No line items</TableCell></TableRow>
                    )}
                    {lineItems.map((li) => (
                      <TableRow key={li.id}>
                        <TableCell>{li.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{li.quantity}</TableCell>
                        <TableCell>{li.unit || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(li.unit_price)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(li.discount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(li.tax_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(li.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AttachmentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        fileUrl={viewerUrl}
      />
    </div>
  );
}
