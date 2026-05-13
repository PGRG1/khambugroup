import React, { useState, useMemo, useCallback } from "react";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, FileDown, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { DataTableShell, usePagination, type FilterField } from "@/components/common/data-table";

const VENUES = ["The Carpet Bar", "Bosa", "Khambu"];
const STATUSES = ["pending", "verified", "approved", "paid", "overdue", "cancelled", "disputed"];

export default function DocumentsTab() {
  const { invoices, suppliers, loading } = useInvoiceData();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [downloading, setDownloading] = useState(false);

  // Only invoices with attachments
  const docsInvoices = useMemo(() => invoices.filter((inv) => inv.file_url), [invoices]);

  // Extract unique periods (YYYY-MM)
  const periods = useMemo(() => {
    const set = new Set<string>();
    docsInvoices.forEach((inv) => {
      if (inv.invoice_date) set.add(inv.invoice_date.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [docsInvoices]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = docsInvoices;
    if (periodFilter !== "all") list = list.filter((inv) => inv.invoice_date.startsWith(periodFilter));
    if (supplierFilter !== "all") list = list.filter((inv) => inv.supplier_id === supplierFilter);
    if (venueFilter !== "all") list = list.filter((inv) => inv.venue === venueFilter);
    if (statusFilter !== "all") list = list.filter((inv) => inv.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (inv) =>
          inv.invoice_number.toLowerCase().includes(q) ||
          (inv.supplier_name || "").toLowerCase().includes(q) ||
          (inv.file_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [docsInvoices, periodFilter, supplierFilter, venueFilter, statusFilter, search]);

  const allSelected = filtered.length > 0 && filtered.every((inv) => selectedIds.has(inv.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((inv) => inv.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadFiles = useCallback(
    async (items: typeof filtered) => {
      if (items.length === 0) return;
      setDownloading(true);
      let success = 0;
      for (const inv of items) {
        if (!inv.file_url) continue;
        const { data, error } = await supabase.storage.from("invoice-files").createSignedUrl(inv.file_url, 300);
        if (error || !data?.signedUrl) {
          console.error("Failed to get signed URL for", inv.file_url, error);
          continue;
        }
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.download = inv.file_name || `invoice-${inv.invoice_number}`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        success++;
        if (items.length > 1) await new Promise((r) => setTimeout(r, 350));
      }
      setDownloading(false);
      toast({ title: `Downloaded ${success} file${success !== 1 ? "s" : ""}` });
    },
    [toast]
  );

  const handleDownloadSelected = () => {
    const items = filtered.filter((inv) => selectedIds.has(inv.id));
    downloadFiles(items);
  };

  const handleDownloadAll = () => downloadFiles(filtered);

  const statusColor = (s: string) => {
    switch (s) {
      case "approved": return "default";
      case "verified": return "secondary";
      case "paid": return "default";
      case "pending": return "outline";
      case "overdue": return "destructive";
      case "cancelled": return "destructive";
      default: return "outline";
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading documents…</div>;

  const filterFields: FilterField[] = [
    { type: "select", key: "period", label: "Period", value: periodFilter, onChange: setPeriodFilter, options: periods.map(p => ({ value: p, label: p })), allLabel: "All Periods" },
    { type: "select", key: "supplier", label: "Supplier & Vendor", value: supplierFilter, onChange: setSupplierFilter, options: suppliers.map(s => ({ value: s.id, label: s.name })), allLabel: "All Suppliers & Vendors" },
    { type: "select", key: "venue", label: "Venue", value: venueFilter, onChange: setVenueFilter, options: VENUES.map(v => ({ value: v, label: v })), allLabel: "All Venues" },
    { type: "select", key: "status", label: "Status", value: statusFilter, onChange: setStatusFilter, options: STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })), allLabel: "All Statuses" },
  ];
  const resetFilters = () => { setPeriodFilter("all"); setSupplierFilter("all"); setVenueFilter("all"); setStatusFilter("all"); };
  const pag = usePagination(filtered);

  return (
    <DataTableShell
      search={{ value: search, onChange: setSearch, placeholder: "Search invoice # or supplier & vendor…" }}
      filters={{ fields: filterFields, onReset: resetFilters }}
      resultCount={`${filtered.length} document${filtered.length !== 1 ? "s" : ""}${selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}`}
      toolbarRight={
        <>
          <Button size="sm" variant="outline" disabled={selectedIds.size === 0 || downloading} onClick={handleDownloadSelected} className="h-9">
            {downloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Download Selected
          </Button>
          <Button size="sm" variant="outline" disabled={filtered.length === 0 || downloading} onClick={handleDownloadAll} className="h-9">
            <FileDown className="h-4 w-4 mr-1" />
            Download All
          </Button>
        </>
      }
      pagination={{
        page: pag.page, pageSize: pag.pageSize, totalPages: pag.totalPages,
        rangeStart: pag.rangeStart, rangeEnd: pag.rangeEnd, total: pag.total,
        onPageChange: pag.setPage, onPageSizeChange: pag.setPageSize,
      }}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Supplier & Vendor</TableHead>
            <TableHead>Invoice #</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pag.pageItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No documents found.
              </TableCell>
            </TableRow>
          ) : (
            pag.pageItems.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <Checkbox checked={selectedIds.has(inv.id)} onCheckedChange={() => toggleOne(inv.id)} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {inv.invoice_date ? format(new Date(inv.invoice_date + "T00:00:00"), "dd MMM yyyy") : "—"}
                </TableCell>
                <TableCell>{inv.supplier_name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                <TableCell>{inv.venue}</TableCell>
                <TableCell>
                  <Badge variant={statusColor(inv.status) as any} className="capitalize text-xs">
                    {inv.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {inv.file_name || "attachment"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={downloading} onClick={() => downloadFiles([inv])}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}

