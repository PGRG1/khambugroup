import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Supplier } from "@/hooks/useInvoiceData";

interface LineItemRow {
  id: string;
  supplier_name: string;
  invoice_number: string;
  item_code: string;
  master_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  net_amount: number;
}

interface Props {
  suppliers: Supplier[];
}

export default function LineItemsTab({ suppliers }: Props) {
  const [rows, setRows] = useState<LineItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [sortKey, setSortKey] = useState<string>("invoice_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Fetch line items with invoice + supplier info
      const { data: items } = await supabase
        .from("invoice_line_items")
        .select("id, item_code, description, pack_size, quantity, unit, unit_price, tax_amount, total, invoice_id, standard_product_id");

      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, supplier_id");

      const { data: products } = await supabase
        .from("standard_products")
        .select("id, name");

      if (!items || !invoices) { setLoading(false); return; }

      const invMap = new Map(invoices.map((i: any) => [i.id, i]));
      const supMap = new Map(suppliers.map(s => [s.id, s.name]));
      const prodMap = new Map((products || []).map((p: any) => [p.id, p.name]));

      const mapped: LineItemRow[] = items.map((li: any) => {
        const inv = invMap.get(li.invoice_id);
        return {
          id: li.id,
          supplier_name: inv ? (supMap.get(inv.supplier_id) || "Unknown") : "Unknown",
          invoice_number: inv?.invoice_number || "",
          item_code: li.item_code || "",
          master_name: li.standard_product_id ? (prodMap.get(li.standard_product_id) || "") : "",
          description: `${li.description || ""}${li.pack_size ? ` [${li.pack_size}]` : ""}`,
          quantity: li.quantity || 0,
          unit: li.unit || "unit",
          unit_price: li.unit_price || 0,
          net_amount: li.total || 0,
        };
      });

      setRows(mapped);
      setLoading(false);
    })();
  }, [suppliers]);

  const filtered = useMemo(() => {
    let result = rows;
    if (supplierFilter !== "all") {
      result = result.filter(r => r.supplier_name === supplierFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.description.toLowerCase().includes(q) ||
        r.item_code.toLowerCase().includes(q) ||
        r.master_name.toLowerCase().includes(q) ||
        r.invoice_number.toLowerCase().includes(q) ||
        r.supplier_name.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, supplierFilter, search, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const SortableHead = ({ col, label, className }: { col: string; label: string; className?: string }) => (
    <TableHead className={className}>
      <button onClick={() => toggleSort(col)} className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label} <SortIcon col={col} />
      </button>
    </TableHead>
  );

  const formatCurrency = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const uniqueSuppliers = [...new Set(rows.map(r => r.supplier_name))].sort();

  const totalNet = filtered.reduce((s, r) => s + r.net_amount, 0);

  if (loading) return <p className="text-muted-foreground p-4">Loading line items...</p>;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {uniqueSuppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          Showing {filtered.length} of {rows.length} items
        </span>
      </div>

      <div className="rounded-lg border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <SortableHead col="supplier_name" label="Supplier" />
              <SortableHead col="invoice_number" label="Invoice No." />
              <SortableHead col="item_code" label="Product No." />
              <SortableHead col="master_name" label="Master Name" />
              <SortableHead col="description" label="Product Description" />
              <SortableHead col="quantity" label="Qty" className="text-right" />
              <SortableHead col="unit" label="Order Unit" />
              <SortableHead col="unit_price" label="Unit Price" className="text-right" />
              <SortableHead col="net_amount" label="Net Amount" className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No line items found</TableCell>
              </TableRow>
            ) : (
              filtered.map(row => (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{row.supplier_name}</TableCell>
                  <TableCell>{row.invoice_number}</TableCell>
                  <TableCell className="font-mono text-xs">{row.item_code}</TableCell>
                  <TableCell>{row.master_name}</TableCell>
                  <TableCell className="max-w-[300px] truncate">{row.description}</TableCell>
                  <TableCell className="text-right">{row.quantity}</TableCell>
                  <TableCell>{row.unit}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.unit_price)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(row.net_amount)}</TableCell>
                </TableRow>
              ))
            )}
            {filtered.length > 0 && (
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell colSpan={8} className="text-right">Total</TableCell>
                <TableCell className="text-right">{formatCurrency(totalNet)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
