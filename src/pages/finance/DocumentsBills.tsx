import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Eye, Search, Download, FileStack, Paperclip } from "lucide-react";
import { useInvoiceData, Invoice, InvoiceLineItem } from "@/hooks/useInvoiceData";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { downloadCSV } from "@/utils/csvDownload";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  verified: "bg-indigo-100 text-indigo-800 border-indigo-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  paid: "bg-green-100 text-green-800 border-green-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
  partial: "bg-blue-100 text-blue-800 border-blue-300",
  cancelled: "bg-muted text-muted-foreground",
};

const fmt = (n: number) => `HK$ ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
      Vendor: supplierMap.get(inv.supplier_id) || "",
      "Invoice Number": inv.invoice_number,
      "Invoice Date": inv.invoice_date,
      "Due Date": inv.due_date || "",
      Amount: inv.total_amount,
      Status: inv.status,
      "File Name": inv.file_name || "",
    }));
    downloadCSV("documents-bills.csv", rows);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight flex items-center gap-2">
            <FileStack className="h-6 w-6 text-primary" /> Documents & Bills
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Finance-owned view of invoices and bills.
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card className="card-glass p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vendor or invoice #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
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

      <Card className="card-glass">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor / Counterparty</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source Document</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">Loading...</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No bills found.</TableCell></TableRow>
              )}
              {filtered.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{supplierMap.get(inv.supplier_id) || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.invoice_date}</TableCell>
                  <TableCell>{inv.due_date || "—"}</TableCell>
                  <TableCell className="text-right td-num">{fmt(inv.total_amount)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[inv.status] || ""} variant="outline">{inv.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {inv.file_url ? (
                      <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => openAttachment(inv.file_url!)}>
                        <Paperclip className="h-3.5 w-3.5" /> View
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openDetails(inv)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

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
                <div><div className="text-muted-foreground text-xs">Invoice Date</div><div>{selected.invoice_date}</div></div>
                <div><div className="text-muted-foreground text-xs">Due Date</div><div>{selected.due_date || "—"}</div></div>
                <div><div className="text-muted-foreground text-xs">Subtotal</div><div className="td-num">{fmt(selected.subtotal)}</div></div>
                <div><div className="text-muted-foreground text-xs">Tax</div><div className="td-num">{fmt(selected.tax_amount)}</div></div>
                <div><div className="text-muted-foreground text-xs">Discount</div><div className="td-num">{fmt(selected.discount)}</div></div>
                <div><div className="text-muted-foreground text-xs">Total</div><div className="td-num font-semibold">{fmt(selected.total_amount)}</div></div>
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
                        <TableCell className="text-right td-num">{li.quantity}</TableCell>
                        <TableCell>{li.unit || "—"}</TableCell>
                        <TableCell className="text-right td-num">{fmt(li.unit_price)}</TableCell>
                        <TableCell className="text-right td-num">{fmt(li.discount)}</TableCell>
                        <TableCell className="text-right td-num">{fmt(li.tax_amount)}</TableCell>
                        <TableCell className="text-right td-num">{fmt(li.total)}</TableCell>
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
