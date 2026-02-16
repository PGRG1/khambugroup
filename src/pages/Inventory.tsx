import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useInventoryData, InventoryCount } from "@/hooks/useInventoryData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Lock, Package, ShoppingCart } from "lucide-react";

export default function Inventory() {
  const { items, periods, categories, loading, fetchCounts, createItem, createPeriod, upsertCounts, closePeriod } = useInventoryData();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("periods");
  const [venueFilter, setVenueFilter] = useState("Assembly");

  // Period detail
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [editCounts, setEditCounts] = useState<Record<string, { beginning_qty: string; purchases_qty: string; ending_qty: string; unit_cost: string }>>({});

  // Dialogs
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category_id: "", unit_of_measure: "unit", par_level: "" });
  const [newPeriod, setNewPeriod] = useState({ period_label: "", period_start: "", period_end: "", venue: "Assembly" });

  // Purchases from invoices
  const [purchaseDateFrom, setPurchaseDateFrom] = useState("");
  const [purchaseDateTo, setPurchaseDateTo] = useState("");
  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  const fetchPurchases = useCallback(async () => {
    if (!purchaseDateFrom || !purchaseDateTo) return;
    setPurchasesLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, supplier_id, venue")
      .eq("venue", venueFilter)
      .gte("invoice_date", purchaseDateFrom)
      .lte("invoice_date", purchaseDateTo)
      .order("invoice_date");

    if (!data || data.length === 0) { setPurchases([]); setPurchasesLoading(false); return; }

    const invoiceIds = data.map((inv: any) => inv.id);
    const { data: lineItems } = await supabase
      .from("invoice_line_items")
      .select("*")
      .in("invoice_id", invoiceIds);

    // Get supplier names
    const supplierIds = [...new Set(data.map((inv: any) => inv.supplier_id))];
    const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
    const supplierMap = new Map((suppliers || []).map((s: any) => [s.id, s.name]));
    const invoiceMap = new Map(data.map((inv: any) => [inv.id, { ...inv, supplier_name: supplierMap.get(inv.supplier_id) || "Unknown" }]));

    const enriched = (lineItems || []).map((li: any) => {
      const inv = invoiceMap.get(li.invoice_id);
      return { ...li, invoice_number: inv?.invoice_number, invoice_date: inv?.invoice_date, supplier_name: inv?.supplier_name };
    });
    setPurchases(enriched);
    setPurchasesLoading(false);
  }, [purchaseDateFrom, purchaseDateTo, venueFilter]);

  const filteredPeriods = useMemo(() => periods.filter((p) => p.venue === venueFilter), [periods, venueFilter]);
  const selectedPeriodObj = periods.find((p) => p.id === selectedPeriod);

  useEffect(() => {
    if (selectedPeriod && items.length > 0) {
      fetchCounts(selectedPeriod).then((c) => {
        setCounts(c);
        const map: typeof editCounts = {};
        // Populate with existing counts + missing items
        const countedItemIds = new Set(c.map((x) => x.item_id));
        for (const ct of c) {
          map[ct.item_id] = { beginning_qty: String(ct.beginning_qty), purchases_qty: String(ct.purchases_qty), ending_qty: String(ct.ending_qty), unit_cost: String(ct.unit_cost) };
        }
        for (const item of items.filter((i) => i.is_active && !countedItemIds.has(i.id))) {
          map[item.id] = { beginning_qty: "0", purchases_qty: "0", ending_qty: "0", unit_cost: "0" };
        }
        setEditCounts(map);
      });
    }
  }, [selectedPeriod, items, fetchCounts]);

  const handleSaveCounts = async () => {
    if (!selectedPeriod) return;
    const rows = Object.entries(editCounts).map(([item_id, vals]) => ({
      period_id: selectedPeriod,
      item_id,
      venue: venueFilter,
      beginning_qty: parseFloat(vals.beginning_qty) || 0,
      purchases_qty: parseFloat(vals.purchases_qty) || 0,
      ending_qty: parseFloat(vals.ending_qty) || 0,
      unit_cost: parseFloat(vals.unit_cost) || 0,
    }));
    await upsertCounts(rows);
    const c = await fetchCounts(selectedPeriod);
    setCounts(c);
  };

  const handleCreateItem = async () => {
    await createItem({ name: newItem.name, category_id: newItem.category_id || null, unit_of_measure: newItem.unit_of_measure, par_level: newItem.par_level ? parseFloat(newItem.par_level) : null, is_active: true });
    setItemDialogOpen(false);
    setNewItem({ name: "", category_id: "", unit_of_measure: "unit", par_level: "" });
  };

  const handleCreatePeriod = async () => {
    await createPeriod({ venue: newPeriod.venue, period_label: newPeriod.period_label, period_start: newPeriod.period_start, period_end: newPeriod.period_end, status: "open", created_by: user?.id || "" });
    setPeriodDialogOpen(false);
    setNewPeriod({ period_label: "", period_start: "", period_end: "", venue: "Assembly" });
  };

  const updateCount = (itemId: string, field: string, value: string) => {
    setEditCounts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  if (loading) return <div className="p-6"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold font-display">Inventory</h1>
        <div className="flex gap-2 flex-wrap">
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Assembly">Assembly</SelectItem>
              <SelectItem value="Caliente">Caliente</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setItemDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />Add Item</Button>
          <Button size="sm" onClick={() => setPeriodDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />New Period</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="periods">Periods & Counts</TabsTrigger>
          <TabsTrigger value="purchases"><ShoppingCart className="h-3 w-3 mr-1" />Invoice Purchases</TabsTrigger>
          <TabsTrigger value="items">Items Master</TabsTrigger>
        </TabsList>

        <TabsContent value="periods" className="space-y-3">
          {!selectedPeriod ? (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPeriods.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No periods for {venueFilter}</TableCell></TableRow>
                  ) : filteredPeriods.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelectedPeriod(p.id)}>
                      <TableCell className="font-medium">{p.period_label}</TableCell>
                      <TableCell>{p.period_start}</TableCell>
                      <TableCell>{p.period_end}</TableCell>
                      <TableCell><Badge variant={p.status === "open" ? "default" : "secondary"}>{p.status === "open" ? "Open" : <><Lock className="h-3 w-3 inline mr-1" />Closed</>}</Badge></TableCell>
                      <TableCell><Package className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPeriod(null)}>← Back</Button>
                  <span className="ml-2 font-semibold">{selectedPeriodObj?.period_label}</span>
                  <Badge className="ml-2" variant={selectedPeriodObj?.status === "open" ? "default" : "secondary"}>{selectedPeriodObj?.status}</Badge>
                </div>
                {selectedPeriodObj?.status === "open" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveCounts}>Save Counts</Button>
                    <Button size="sm" variant="outline" onClick={() => closePeriod(selectedPeriod)}><Lock className="h-3 w-3 mr-1" />Close Period</Button>
                  </div>
                )}
              </div>

              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Beginning</TableHead>
                      <TableHead className="text-right">Purchases</TableHead>
                      <TableHead className="text-right">Ending</TableHead>
                      <TableHead className="text-right">Usage</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.filter((i) => i.is_active).map((item) => {
                      const vals = editCounts[item.id];
                      if (!vals) return null;
                      const usage = (parseFloat(vals.beginning_qty) || 0) + (parseFloat(vals.purchases_qty) || 0) - (parseFloat(vals.ending_qty) || 0);
                      const totalCost = usage * (parseFloat(vals.unit_cost) || 0);
                      const isLocked = selectedPeriodObj?.status === "closed";

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-muted-foreground">{item.category_name || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Input type="number" className="w-20 text-right ml-auto" value={vals.beginning_qty} onChange={(e) => updateCount(item.id, "beginning_qty", e.target.value)} disabled={isLocked} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input type="number" className="w-20 text-right ml-auto" value={vals.purchases_qty} onChange={(e) => updateCount(item.id, "purchases_qty", e.target.value)} disabled={isLocked} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input type="number" className="w-20 text-right ml-auto" value={vals.ending_qty} onChange={(e) => updateCount(item.id, "ending_qty", e.target.value)} disabled={isLocked} />
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">{usage.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <Input type="number" className="w-20 text-right ml-auto" value={vals.unit_cost} onChange={(e) => updateCount(item.id, "unit_cost", e.target.value)} disabled={isLocked} />
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">{totalCost.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="purchases" className="space-y-3">
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={purchaseDateFrom} onChange={(e) => setPurchaseDateFrom(e.target.value)} className="w-[150px]" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={purchaseDateTo} onChange={(e) => setPurchaseDateTo(e.target.value)} className="w-[150px]" />
            </div>
            <Button size="sm" onClick={fetchPurchases} disabled={!purchaseDateFrom || !purchaseDateTo || purchasesLoading}>
              {purchasesLoading ? "Loading..." : "Load Purchases"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Shows all invoice line items for <span className="font-medium">{venueFilter}</span> in the selected date range.</p>

          {purchases.length > 0 && (
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Pack Size</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{p.invoice_date}</TableCell>
                      <TableCell className="text-xs">{p.supplier_name}</TableCell>
                      <TableCell className="text-xs font-medium">{p.invoice_number}</TableCell>
                      <TableCell>{p.description}</TableCell>
                      <TableCell className="text-xs">{p.pack_size || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{p.quantity}</TableCell>
                      <TableCell className="text-xs">{p.unit || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{p.weight ? `${p.weight} KG` : "—"}</TableCell>
                      <TableCell className="text-right font-mono">{Number(p.unit_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{Number(p.total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-medium">
                    <TableCell colSpan={9} className="text-right">Grand Total:</TableCell>
                    <TableCell className="text-right font-mono font-bold">{purchases.reduce((s, p) => s + Number(p.total), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {purchases.length === 0 && !purchasesLoading && purchaseDateFrom && purchaseDateTo && (
            <p className="text-center text-muted-foreground py-8">No purchases found for this date range.</p>
          )}
        </TabsContent>

        <TabsContent value="items" className="space-y-3">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Par Level</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No items</TableCell></TableRow>
                ) : items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category_name || "—"}</TableCell>
                    <TableCell>{item.unit_of_measure}</TableCell>
                    <TableCell>{item.par_level ?? "—"}</TableCell>
                    <TableCell>{item.is_active ? "✓" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} /></div>
            <div>
              <Label>Category</Label>
              <Select value={newItem.category_id} onValueChange={(v) => setNewItem({ ...newItem, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Unit of Measure</Label><Input value={newItem.unit_of_measure} onChange={(e) => setNewItem({ ...newItem, unit_of_measure: e.target.value })} placeholder="kg, bottle, etc." /></div>
              <div><Label>Par Level</Label><Input type="number" value={newItem.par_level} onChange={(e) => setNewItem({ ...newItem, par_level: e.target.value })} placeholder="Min stock" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateItem} disabled={!newItem.name.trim()}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Period Dialog */}
      <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Inventory Period</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Label *</Label><Input value={newPeriod.period_label} onChange={(e) => setNewPeriod({ ...newPeriod, period_label: e.target.value })} placeholder="e.g. January 2026" /></div>
            <div>
              <Label>Venue</Label>
              <Select value={newPeriod.venue} onValueChange={(v) => setNewPeriod({ ...newPeriod, venue: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Assembly">Assembly</SelectItem>
                  <SelectItem value="Caliente">Caliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={newPeriod.period_start} onChange={(e) => setNewPeriod({ ...newPeriod, period_start: e.target.value })} /></div>
              <div><Label>End Date</Label><Input type="date" value={newPeriod.period_end} onChange={(e) => setNewPeriod({ ...newPeriod, period_end: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeriodDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreatePeriod} disabled={!newPeriod.period_label.trim() || !newPeriod.period_start || !newPeriod.period_end}>Create Period</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
