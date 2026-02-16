import React, { useState, useMemo } from "react";
import { useInvoiceData, Invoice, InvoiceLineItem } from "@/hooks/useInvoiceData";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Eye, Search, Trash2, ScanLine, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InvoiceScanner from "@/components/invoices/InvoiceScanner";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  paid: "bg-green-100 text-green-800 border-green-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
  partial: "bg-blue-100 text-blue-800 border-blue-300",
  cancelled: "bg-muted text-muted-foreground",
};

export default function Invoices() {
  const { invoices, suppliers, categories, loading, fetchLineItems, createInvoice, updateInvoice, deleteInvoice, updateInvoiceStatus, createSupplier, createCategory, fetchAll } = useInvoiceData();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("invoices");
  const [scannerOpen, setScannerOpen] = useState(false);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editInv, setEditInv] = useState({ supplier_id: "", venue: "Assembly", invoice_number: "", invoice_date: "", due_date: "", notes: "", status: "pending" });
  const [editLines, setEditLines] = useState<{ item_code: string; description: string; pack_size: string; quantity: string; unit: string; weight: string; unit_price: string; tax_amount: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New invoice form
  const [newInv, setNewInv] = useState({ supplier_id: "", venue: "Assembly", invoice_number: "", invoice_date: "", due_date: "", notes: "" });
  const [newLines, setNewLines] = useState<{ item_code: string; description: string; pack_size: string; quantity: string; unit: string; weight: string; unit_price: string; tax_amount: string }[]>([
    { item_code: "", description: "", pack_size: "", quantity: "1", unit: "", weight: "", unit_price: "0", tax_amount: "0" },
  ]);

  // Supplier form
  const [newSupplier, setNewSupplier] = useState({ name: "", contact_person: "", email: "", phone: "", address: "", notes: "" });
  // Category form
  const [newCatName, setNewCatName] = useState("");

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (venueFilter !== "all" && inv.venue !== venueFilter) return false;
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return inv.invoice_number.toLowerCase().includes(q) || (inv.supplier_name || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [invoices, venueFilter, statusFilter, search]);

  const openDetail = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    const items = await fetchLineItems(inv.id);
    setLineItems(items);
    setDrawerOpen(true);
  };

  const openEdit = async (inv: Invoice) => {
    setEditingId(inv.id);
    setEditInv({
      supplier_id: inv.supplier_id,
      venue: inv.venue,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date || "",
      notes: inv.notes || "",
      status: inv.status,
    });
    const items = await fetchLineItems(inv.id);
    setEditLines(items.map((li) => ({
      item_code: li.item_code || "",
      description: li.description,
      pack_size: li.pack_size || "",
      quantity: String(li.quantity),
      unit: li.unit || "",
      weight: li.weight ? String(li.weight) : "",
      unit_price: String(li.unit_price),
      tax_amount: String(li.tax_amount),
    })));
    setDrawerOpen(false);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const lines = editLines.filter((l) => l.description.trim()).map((l) => {
      const qty = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unit_price) || 0;
      const tax = parseFloat(l.tax_amount) || 0;
      const w = l.weight ? parseFloat(l.weight) : null;
      const lineTotal = w ? w * price + tax : qty * price + tax;
      return { item_code: l.item_code || "", description: l.description, pack_size: l.pack_size || "", category_id: null, quantity: qty, unit: l.unit || null, weight: w, unit_price: price, tax_amount: tax, total: lineTotal, notes: null };
    });
    const subtotal = lines.reduce((s, l) => s + l.total - l.tax_amount, 0);
    const taxTotal = lines.reduce((s, l) => s + l.tax_amount, 0);

    const ok = await updateInvoice(editingId, {
      supplier_id: editInv.supplier_id,
      venue: editInv.venue,
      invoice_number: editInv.invoice_number,
      invoice_date: editInv.invoice_date,
      due_date: editInv.due_date || null,
      notes: editInv.notes || null,
      status: editInv.status,
      subtotal,
      tax_amount: taxTotal,
      total_amount: subtotal + taxTotal,
    }, lines);
    if (ok) setEditOpen(false);
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteInvoice(deletingId);
    setDeleteOpen(false);
    setDeletingId(null);
    setDrawerOpen(false);
    setSelectedInvoice(null);
  };

  const handleCreateInvoice = async () => {
    const lines = newLines.filter((l) => l.description.trim()).map((l) => {
      const qty = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unit_price) || 0;
      const tax = parseFloat(l.tax_amount) || 0;
      const w = l.weight ? parseFloat(l.weight) : null;
      const lineTotal = w ? w * price + tax : qty * price + tax;
      return { item_code: l.item_code || "", description: l.description, pack_size: l.pack_size || "", category_id: null, quantity: qty, unit: l.unit || null, weight: w, unit_price: price, tax_amount: tax, total: lineTotal, notes: null };
    });
    const subtotal = lines.reduce((s, l) => s + l.total - l.tax_amount, 0);
    const taxTotal = lines.reduce((s, l) => s + l.tax_amount, 0);

    await createInvoice(
      { supplier_id: newInv.supplier_id, venue: newInv.venue, invoice_number: newInv.invoice_number, invoice_date: newInv.invoice_date, due_date: newInv.due_date || null, status: "pending", subtotal, tax_amount: taxTotal, total_amount: subtotal + taxTotal, notes: newInv.notes || null, entered_by: user?.id || "" },
      lines
    );
    setCreateOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setNewInv({ supplier_id: "", venue: "Assembly", invoice_number: "", invoice_date: "", due_date: "", notes: "" });
    setNewLines([{ item_code: "", description: "", pack_size: "", quantity: "1", unit: "", weight: "", unit_price: "0", tax_amount: "0" }]);
  };

  const addLine = () => setNewLines([...newLines, { item_code: "", description: "", pack_size: "", quantity: "1", unit: "", weight: "", unit_price: "0", tax_amount: "0" }]);
  const removeLine = (i: number) => setNewLines(newLines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: string, value: string) => {
    const updated = [...newLines];
    (updated[i] as any)[field] = value;
    setNewLines(updated);
  };

  // Edit line helpers
  const addEditLine = () => setEditLines([...editLines, { item_code: "", description: "", pack_size: "", quantity: "1", unit: "", weight: "", unit_price: "0", tax_amount: "0" }]);
  const removeEditLine = (i: number) => { if (editLines.length > 1) setEditLines(editLines.filter((_, idx) => idx !== i)); };
  const updateEditLine = (i: number, field: string, value: string) => {
    const updated = [...editLines];
    (updated[i] as any)[field] = value;
    setEditLines(updated);
  };

  const handleCreateSupplier = async () => {
    await createSupplier({ name: newSupplier.name, contact_person: newSupplier.contact_person || null, email: newSupplier.email || null, phone: newSupplier.phone || null, address: newSupplier.address || null, notes: newSupplier.notes || null, is_active: true });
    setSupplierDialogOpen(false);
    setNewSupplier({ name: "", contact_person: "", email: "", phone: "", address: "", notes: "" });
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    await createCategory(newCatName.trim());
    setCategoryDialogOpen(false);
    setNewCatName("");
  };

  if (loading) return <div className="p-6"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold font-display">Invoices</h1>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setCategoryDialogOpen(true)}>+ Category</Button>
          <Button size="sm" variant="outline" onClick={() => setSupplierDialogOpen(true)}>+ Supplier</Button>
          <Button size="sm" variant="outline" onClick={() => setScannerOpen(true)}>
            <ScanLine className="h-4 w-4 mr-1" />Scan Invoice
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Invoice</Button>
        </div>
      </div>

      {scannerOpen && (
        <InvoiceScanner
          suppliers={suppliers}
          onSave={async (inv, lines) => {
            await createInvoice(
              { ...inv, status: "pending", subtotal: lines.reduce((s, l) => s + l.total - l.tax_amount, 0), tax_amount: lines.reduce((s, l) => s + l.tax_amount, 0), total_amount: lines.reduce((s, l) => s + l.total, 0), entered_by: user?.id || "" },
              lines
            );
          }}
          onCreateSupplier={createSupplier}
          onClose={() => setScannerOpen(false)}
          userId={user?.id || ""}
        />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Venues</SelectItem>
                <SelectItem value="Assembly">Assembly</SelectItem>
                <SelectItem value="Caliente">Caliente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No invoices found</TableCell></TableRow>
                ) : filtered.map((inv) => (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => openDetail(inv)}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>{inv.supplier_name}</TableCell>
                    <TableCell>{inv.venue}</TableCell>
                    <TableCell>{inv.invoice_date}</TableCell>
                    <TableCell>{inv.due_date || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge className={STATUS_COLORS[inv.status] || ""}>{inv.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(inv); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); confirmDelete(inv.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-3">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No suppliers</TableCell></TableRow>
                ) : suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.contact_person || "—"}</TableCell>
                    <TableCell>{s.email || "—"}</TableCell>
                    <TableCell>{s.phone || "—"}</TableCell>
                    <TableCell>{s.is_active ? "✓" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="categories" className="space-y-3">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">No categories</TableCell></TableRow>
                ) : categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.description || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Invoice Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedInvoice && (
            <>
              <SheetHeader>
                <SheetTitle>Invoice #{selectedInvoice.invoice_number}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{selectedInvoice.supplier_name}</span></div>
                  <div><span className="text-muted-foreground">Venue:</span> <span className="font-medium">{selectedInvoice.venue}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{selectedInvoice.invoice_date}</span></div>
                  <div><span className="text-muted-foreground">Due:</span> <span className="font-medium">{selectedInvoice.due_date || "—"}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge className={STATUS_COLORS[selectedInvoice.status] || ""}>{selectedInvoice.status}</Badge></div>
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-bold font-mono">{Number(selectedInvoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                </div>
                {selectedInvoice.notes && <p className="text-sm text-muted-foreground">{selectedInvoice.notes}</p>}

                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => openEdit(selectedInvoice)}>
                    <Pencil className="h-4 w-4 mr-1" />Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => confirmDelete(selectedInvoice.id)}>
                    <Trash2 className="h-4 w-4 mr-1" />Delete
                  </Button>
                  {selectedInvoice.status !== "paid" && <Button size="sm" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "paid"); setDrawerOpen(false); }}>Mark Paid</Button>}
                  {selectedInvoice.status !== "overdue" && <Button size="sm" variant="outline" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "overdue"); setDrawerOpen(false); }}>Mark Overdue</Button>}
                  {selectedInvoice.status !== "cancelled" && <Button size="sm" variant="outline" onClick={() => { updateInvoiceStatus(selectedInvoice.id, "cancelled"); setDrawerOpen(false); }}>Cancel</Button>}
                </div>

                <h3 className="text-sm font-semibold mt-4">Line Items</h3>
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Pack Size</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No line items</TableCell></TableRow>
                      ) : lineItems.map((li) => (
                        <TableRow key={li.id}>
                          <TableCell className="text-xs text-muted-foreground">{li.item_code || "—"}</TableCell>
                          <TableCell>{li.description}</TableCell>
                          <TableCell className="text-xs">{li.pack_size || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{li.quantity}</TableCell>
                          <TableCell>{li.unit || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{li.weight ? `${li.weight} KG` : "—"}</TableCell>
                          <TableCell className="text-right font-mono">{Number(li.unit_price).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{Number(li.total).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Invoice Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <Select value={editInv.supplier_id} onValueChange={(v) => setEditInv({ ...editInv, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Venue</Label>
                <Select value={editInv.venue} onValueChange={(v) => setEditInv({ ...editInv, venue: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Assembly">Assembly</SelectItem>
                    <SelectItem value="Caliente">Caliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Invoice Number</Label>
                <Input value={editInv.invoice_number} onChange={(e) => setEditInv({ ...editInv, invoice_number: e.target.value })} />
              </div>
              <div>
                <Label>Invoice Date</Label>
                <Input type="date" value={editInv.invoice_date} onChange={(e) => setEditInv({ ...editInv, invoice_date: e.target.value })} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={editInv.due_date} onChange={(e) => setEditInv({ ...editInv, due_date: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editInv.status} onValueChange={(v) => setEditInv({ ...editInv, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={editInv.notes} onChange={(e) => setEditInv({ ...editInv, notes: e.target.value })} rows={2} />
              </div>
            </div>

            <h3 className="text-sm font-semibold">Line Items</h3>
            <div className="space-y-2">
              {editLines.map((line, i) => (
                <div key={i} className="grid grid-cols-[70px_1fr_80px_55px_55px_65px_75px_70px_32px] gap-1 items-end">
                  <div>
                    {i === 0 && <Label className="text-xs">Code</Label>}
                    <Input value={line.item_code} onChange={(e) => updateEditLine(i, "item_code", e.target.value)} placeholder="Code" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Description</Label>}
                    <Input value={line.description} onChange={(e) => updateEditLine(i, "description", e.target.value)} placeholder="Item" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Pack Size</Label>}
                    <Input value={line.pack_size} onChange={(e) => updateEditLine(i, "pack_size", e.target.value)} placeholder="4X4LB" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Qty</Label>}
                    <Input type="number" value={line.quantity} onChange={(e) => updateEditLine(i, "quantity", e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Unit</Label>}
                    <Input value={line.unit} onChange={(e) => updateEditLine(i, "unit", e.target.value)} placeholder="CTN" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Weight</Label>}
                    <Input type="number" value={line.weight} onChange={(e) => updateEditLine(i, "weight", e.target.value)} placeholder="KG" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Price</Label>}
                    <Input type="number" value={line.unit_price} onChange={(e) => updateEditLine(i, "unit_price", e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Tax</Label>}
                    <Input type="number" value={line.tax_amount} onChange={(e) => updateEditLine(i, "tax_amount", e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    {editLines.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeEditLine(i)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addEditLine}><Plus className="h-3 w-3 mr-1" />Add Line</Button>
            </div>

            <div className="text-right text-sm border-t pt-2">
              <span className="text-muted-foreground">Subtotal: </span>
              <span className="font-mono font-medium">
                {editLines.reduce((s, l) => {
                  const w = l.weight ? parseFloat(l.weight) : null;
                  const price = parseFloat(l.unit_price) || 0;
                  const qty = parseFloat(l.quantity) || 0;
                  return s + (w ? w * price : qty * price);
                }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!editInv.supplier_id || !editInv.invoice_number || !editInv.invoice_date}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <Select value={newInv.supplier_id} onValueChange={(v) => setNewInv({ ...newInv, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Venue</Label>
                <Select value={newInv.venue} onValueChange={(v) => setNewInv({ ...newInv, venue: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Assembly">Assembly</SelectItem>
                    <SelectItem value="Caliente">Caliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Invoice Number</Label>
                <Input value={newInv.invoice_number} onChange={(e) => setNewInv({ ...newInv, invoice_number: e.target.value })} />
              </div>
              <div>
                <Label>Invoice Date</Label>
                <Input type="date" value={newInv.invoice_date} onChange={(e) => setNewInv({ ...newInv, invoice_date: e.target.value })} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={newInv.due_date} onChange={(e) => setNewInv({ ...newInv, due_date: e.target.value })} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={newInv.notes} onChange={(e) => setNewInv({ ...newInv, notes: e.target.value })} rows={2} />
              </div>
            </div>

            <h3 className="text-sm font-semibold">Line Items</h3>
            <div className="space-y-2">
              {newLines.map((line, i) => (
                <div key={i} className="grid grid-cols-[70px_1fr_80px_55px_55px_65px_75px_70px_32px] gap-1 items-end">
                  <div>
                    {i === 0 && <Label className="text-xs">Code</Label>}
                    <Input value={line.item_code} onChange={(e) => updateLine(i, "item_code", e.target.value)} placeholder="Code" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Description</Label>}
                    <Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Item" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Pack Size</Label>}
                    <Input value={line.pack_size} onChange={(e) => updateLine(i, "pack_size", e.target.value)} placeholder="4X4LB" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Qty</Label>}
                    <Input type="number" value={line.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Unit</Label>}
                    <Input value={line.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} placeholder="CTN" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Weight</Label>}
                    <Input type="number" value={line.weight} onChange={(e) => updateLine(i, "weight", e.target.value)} placeholder="KG" className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Price</Label>}
                    <Input type="number" value={line.unit_price} onChange={(e) => updateLine(i, "unit_price", e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Tax</Label>}
                    <Input type="number" value={line.tax_amount} onChange={(e) => updateLine(i, "tax_amount", e.target.value)} className="text-xs" />
                  </div>
                  <div>
                    {newLines.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Add Line</Button>
            </div>

            <div className="text-right text-sm border-t pt-2">
              <span className="text-muted-foreground">Subtotal: </span>
              <span className="font-mono font-medium">
                {newLines.reduce((s, l) => {
                  const w = l.weight ? parseFloat(l.weight) : null;
                  const price = parseFloat(l.unit_price) || 0;
                  const qty = parseFloat(l.quantity) || 0;
                  return s + (w ? w * price : qty * price);
                }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={!newInv.supplier_id || !newInv.invoice_number || !newInv.invoice_date}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} /></div>
            <div><Label>Contact Person</Label><Input value={newSupplier.contact_person} onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /></div>
            </div>
            <div><Label>Address</Label><Textarea value={newSupplier.address} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSupplier} disabled={!newSupplier.name.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Expense Category</DialogTitle></DialogHeader>
          <div><Label>Category Name</Label><Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g. Spirits" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCategory} disabled={!newCatName.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="Delete Invoice"
        description="Are you sure? This invoice and all its line items will be permanently removed."
      />
    </div>
  );
}
