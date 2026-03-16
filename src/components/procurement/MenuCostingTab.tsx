import React, { useState, useEffect, useCallback } from "react";
import { useMenuCosting, MenuItem, MenuItemIngredient, MenuItemPricing } from "@/hooks/useMenuCosting";
import { useProductMaster, ProductMasterItem } from "@/hooks/useProductMaster";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChefHat, Info, BookOpen, DollarSign, Pencil, Tag, Download } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function MenuCostingTab() {
  const {
    menuItems, loading, createMenuItem, updateMenuItem, deleteMenuItem,
    fetchIngredients, saveIngredient, deleteIngredient,
    fetchPricing, savePricing, deletePricing, recalcTheoreticalCost,
  } = useMenuCosting();
  const { products } = useProductMaster();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", category: "" });
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [ingredients, setIngredients] = useState<MenuItemIngredient[]>([]);
  const [pricing, setPricing] = useState<MenuItemPricing[]>([]);
  const [detailTab, setDetailTab] = useState("ingredients");

  // Ingredient form - use string for decimal support
  const [ingForm, setIngForm] = useState({ product_master_id: "", quantity_used: "", unit_used: "gms" });
  const [showIngForm, setShowIngForm] = useState(false);

  // Pricing form - use string for decimal support
  const [priceForm, setPriceForm] = useState({ price_type: "", selling_price: "" });
  const [showPriceForm, setShowPriceForm] = useState(false);

  const loadDetail = useCallback(async (item: MenuItem) => {
    setSelectedItem(item);
    const [ings, prs] = await Promise.all([fetchIngredients(item.id), fetchPricing(item.id)]);
    setIngredients(ings);
    setPricing(prs);
  }, [fetchIngredients, fetchPricing]);

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    await createMenuItem(createForm);
    setCreateForm({ name: "", category: "" });
    setShowCreate(false);
  };

  const handleDeleteItem = async (id: string) => {
    await deleteMenuItem(id);
    if (selectedItem?.id === id) setSelectedItem(null);
  };

  const handleAddIngredient = async () => {
    if (!selectedItem || !ingForm.product_master_id) return;
    const pm = products.find(p => p.id === ingForm.product_master_id);
    if (!pm) return;
    const qtyUsed = parseFloat(ingForm.quantity_used) || 0;
    const refCost = pm.cost_per_base_unit;
    const ok = await saveIngredient({
      menu_item_id: selectedItem.id,
      product_master_id: pm.id,
      sku: pm.internal_sku,
      description: pm.internal_product_name,
      quantity_used: qtyUsed,
      unit_used: ingForm.unit_used,
      reference_cost: refCost,
      line_cost: 0,
    });
    if (ok) {
      await recalcTheoreticalCost(selectedItem.id);
      await loadDetail({ ...selectedItem, theoretical_cost: 0 });
      setIngForm({ product_master_id: "", quantity_used: "", unit_used: "gms" });
      setShowIngForm(false);
    }
  };

  const handleDeleteIngredient = async (id: string) => {
    if (!selectedItem) return;
    await deleteIngredient(id);
    await recalcTheoreticalCost(selectedItem.id);
    await loadDetail(selectedItem);
  };

  const handleAddPricing = async () => {
    if (!selectedItem || !priceForm.price_type.trim()) return;
    const currentItem = menuItems.find(m => m.id === selectedItem.id);
    const tc = currentItem?.theoretical_cost ?? 0;
    const sellingPrice = parseFloat(priceForm.selling_price) || 0;
    const ok = await savePricing({
      menu_item_id: selectedItem.id,
      price_type: priceForm.price_type,
      selling_price: sellingPrice,
    }, tc);
    if (ok) {
      await loadDetail(selectedItem);
      setPriceForm({ price_type: "", selling_price: "" });
      setShowPriceForm(false);
    }
  };

  const handleDeletePricing = async (id: string) => {
    if (!selectedItem) return;
    await deletePricing(id);
    await loadDetail(selectedItem);
  };

  // Auto-set unit_used from product's base_unit_type when product is selected
  const handleProductSelect = (productId: string) => {
    const pm = products.find(p => p.id === productId);
    setIngForm(f => ({
      ...f,
      product_master_id: productId,
      unit_used: pm?.base_unit_type || "gms",
    }));
  };

  // Refresh selected item from menuItems when it changes
  useEffect(() => {
    if (selectedItem) {
      const updated = menuItems.find(m => m.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
    }
  }, [menuItems]);

  const theoreticalCost = selectedItem?.theoretical_cost ?? 0;

  // Fetch all pricing data for card display
  const [allPricing, setAllPricing] = useState<Record<string, MenuItemPricing[]>>({});
  useEffect(() => {
    if (menuItems.length === 0) return;
    const loadAll = async () => {
      const results: Record<string, MenuItemPricing[]> = {};
      await Promise.all(menuItems.map(async (item) => {
        const p = await fetchPricing(item.id);
        results[item.id] = p;
      }));
      setAllPricing(results);
    };
    loadAll();
  }, [menuItems, fetchPricing]);

  // Live preview for ingredient form
  const selectedPm = products.find(p => p.id === ingForm.product_master_id);
  const liveQty = parseFloat(ingForm.quantity_used) || 0;
  const liveRefCost = selectedPm?.cost_per_base_unit ?? 0;
  const liveLineCost = liveQty * liveRefCost;

  // Live preview for pricing form
  const liveSellingPrice = parseFloat(priceForm.selling_price) || 0;

  // Edit menu item
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", status: "Active" });

  const openEdit = (item: MenuItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditItem(item);
    setEditForm({ name: item.name, category: item.category, status: item.status });
  };

  const handleEdit = async () => {
    if (!editItem) return;
    await updateMenuItem(editItem.id, editForm);
    setEditItem(null);
  };

  return (
    <div className="space-y-4">
      <Alert className="border-muted">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Theoretical Cost</strong> — This module is for pricing analysis only. It is not connected to live inventory, COGS, or accounting.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Menu Items</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadCSV(menuItems.map(item => {
            const itemPricing = allPricing[item.id] || [];
            const regularPrice = itemPricing.find(p => p.price_type.toLowerCase().includes("regular"));
            const sp = regularPrice?.selling_price ?? itemPricing[0]?.selling_price ?? 0;
            const gp = regularPrice?.gross_profit ?? itemPricing[0]?.gross_profit ?? 0;
            const fcp = regularPrice?.food_cost_pct ?? itemPricing[0]?.food_cost_pct ?? 0;
            return {
              name: item.name, category: item.category, status: item.status,
              theoretical_cost: Number(item.theoretical_cost).toFixed(2),
              selling_price: Number(sp).toFixed(2),
              gross_profit: Number(gp).toFixed(2),
              food_cost_pct: Number(fcp).toFixed(1),
            };
          }), [
            { key: "name", label: "Name" }, { key: "category", label: "Category" }, { key: "status", label: "Status" },
            { key: "theoretical_cost", label: "Theo. Cost" }, { key: "selling_price", label: "Sell Price" },
            { key: "gross_profit", label: "Gross Profit" }, { key: "food_cost_pct", label: "Food Cost %" },
          ], "menu_costing")}><Download className="h-4 w-4 mr-1" />Download</Button>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />Add Menu Item</Button>
        </div>
      </div>

      {/* Menu items cards */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : menuItems.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No menu items yet</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {menuItems.map(item => {
            const itemPricing = allPricing[item.id] || [];
            const regularPrice = itemPricing.find(p => p.price_type.toLowerCase().includes("regular"));
            const sellingPrice = regularPrice?.selling_price ?? itemPricing[0]?.selling_price ?? 0;
            const grossProfit = regularPrice?.gross_profit ?? itemPricing[0]?.gross_profit ?? 0;
            const foodCostPct = regularPrice?.food_cost_pct ?? itemPricing[0]?.food_cost_pct ?? 0;
            const tc = Number(item.theoretical_cost);

            return (
              <div
                key={item.id}
                className="card-glass rounded-xl p-4 flex flex-col gap-3 transition-shadow hover:shadow-md"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-foreground text-sm leading-snug truncate">{item.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.category || "Uncategorized"}</p>
                  </div>
                  <Badge
                    variant={item.status === "Active" ? "default" : "secondary"}
                    className="shrink-0 text-[10px] px-1.5 py-0"
                  >
                    {item.status}
                  </Badge>
                </div>

                {/* Key figures */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Theo. Cost</span>
                    <p className="text-sm font-mono font-semibold text-foreground">${tc.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Sell Price</span>
                    <p className="text-sm font-mono font-semibold text-foreground">
                      {sellingPrice > 0 ? `$${Number(sellingPrice).toFixed(2)}` : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Gross Profit</span>
                    <p className={`text-sm font-mono font-semibold ${Number(grossProfit) < 0 ? "text-destructive" : "text-foreground"}`}>
                      {sellingPrice > 0 ? `$${Number(grossProfit).toFixed(2)}` : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Food Cost %</span>
                    <p className={`text-sm font-mono font-semibold ${Number(foodCostPct) > 35 ? "text-destructive" : "text-foreground"}`}>
                      {sellingPrice > 0 ? `${Number(foodCostPct).toFixed(1)}%` : "—"}
                    </p>
                  </div>
                </div>

                {/* Pricing types badge */}
                {itemPricing.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">
                      {itemPricing.length} pricing {itemPricing.length === 1 ? "type" : "types"}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 pt-1 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 flex-1"
                    onClick={() => { loadDetail(item); setDetailTab("ingredients"); }}
                  >
                    <BookOpen className="h-3 w-3" /> Recipe
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 flex-1"
                    onClick={() => { loadDetail(item); setDetailTab("pricing"); }}
                  >
                    <DollarSign className="h-3 w-3" /> Pricing
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => openEdit(item, e)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Menu Item</DialogTitle>
            <DialogDescription>Add a new menu item for costing analysis.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Beef Taco" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Tacos" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail panel */}
      {selectedItem && (
        <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ChefHat className="h-5 w-5" /> {selectedItem.name}
              </DialogTitle>
              <DialogDescription>
                Category: {selectedItem.category || "—"} · Theoretical Cost: <span className="font-mono font-semibold">${Number(theoreticalCost).toFixed(2)}</span>
              </DialogDescription>
            </DialogHeader>

            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList>
                <TabsTrigger value="ingredients">Recipe / Ingredients</TabsTrigger>
                <TabsTrigger value="pricing">Pricing Types</TabsTrigger>
              </TabsList>

              <TabsContent value="ingredients" className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setShowIngForm(true)}><Plus className="h-4 w-4 mr-1" />Add Ingredient</Button>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU #</TableHead>
                        <TableHead>Product Description</TableHead>
                        <TableHead className="text-right">Qty Used</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Cost per Base Unit</TableHead>
                        <TableHead className="text-right">Line Cost</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ingredients.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No ingredients</TableCell></TableRow>
                      ) : ingredients.map(ing => (
                        <TableRow key={ing.id}>
                          <TableCell className="font-mono text-xs">{ing.sku}</TableCell>
                          <TableCell>{ing.description}</TableCell>
                          <TableCell className="text-right font-mono">{Number(ing.quantity_used).toFixed(2)}</TableCell>
                          <TableCell>{ing.unit_used}</TableCell>
                          <TableCell className="text-right font-mono">${Number(ing.reference_cost).toFixed(4)}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">${Number(ing.line_cost).toFixed(2)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteIngredient(ing.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {ingredients.length > 0 && (
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell colSpan={5} className="text-right">Total Theoretical Cost</TableCell>
                          <TableCell className="text-right font-mono">${Number(theoreticalCost).toFixed(2)}</TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Add ingredient dialog */}
                <Dialog open={showIngForm} onOpenChange={setShowIngForm}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Ingredient</DialogTitle>
                      <DialogDescription>Link a Product Master item as an ingredient.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Product</Label>
                        <Select value={ingForm.product_master_id} onValueChange={handleProductSelect}>
                          <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                          <SelectContent>
                            {products.filter(p => p.status === "Active").map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.internal_sku} — {p.internal_product_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Quantity Used</Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={ingForm.quantity_used}
                            onChange={e => setIngForm(f => ({ ...f, quantity_used: e.target.value }))}
                            placeholder="e.g. 150"
                          />
                        </div>
                        <div>
                          <Label>Unit</Label>
                          <Select value={ingForm.unit_used} onValueChange={v => setIngForm(f => ({ ...f, unit_used: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["gms", "kgs", "mls", "ltrs", "ea/pcs", "pcs", "each", "oz", "lbs"].map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {selectedPm && (
                        <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-md p-2">
                          <p>Cost per Base Unit: <span className="font-mono font-semibold">${liveRefCost.toFixed(4)}</span> per {selectedPm.base_unit_type}</p>
                          <p>Line Cost: <span className="font-mono font-semibold">${liveLineCost.toFixed(2)}</span> ({liveQty} × ${liveRefCost.toFixed(4)})</p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowIngForm(false)}>Cancel</Button>
                      <Button onClick={handleAddIngredient}>Add</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              <TabsContent value="pricing" className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setShowPriceForm(true)}><Plus className="h-4 w-4 mr-1" />Add Price Type</Button>
                </div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Price Type</TableHead>
                        <TableHead className="text-right">Selling Price</TableHead>
                        <TableHead className="text-right">Gross Profit</TableHead>
                        <TableHead className="text-right">Food Cost %</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pricing.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No pricing types</TableCell></TableRow>
                      ) : pricing.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.price_type}</TableCell>
                          <TableCell className="text-right font-mono">${Number(p.selling_price).toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-mono ${Number(p.gross_profit) < 0 ? "text-destructive" : ""}`}>
                            ${Number(p.gross_profit).toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${Number(p.food_cost_pct) > 35 ? "text-destructive" : ""}`}>
                            {Number(p.food_cost_pct).toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => handleDeletePricing(p.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Add pricing dialog */}
                <Dialog open={showPriceForm} onOpenChange={setShowPriceForm}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Price Type</DialogTitle>
                      <DialogDescription>Define a selling price for this menu item.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Price Type Name</Label>
                        <Input value={priceForm.price_type} onChange={e => setPriceForm(f => ({ ...f, price_type: e.target.value }))} placeholder="e.g. Regular Pricing" />
                      </div>
                      <div>
                        <Label>Selling Price ($)</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={priceForm.selling_price}
                          onChange={e => setPriceForm(f => ({ ...f, selling_price: e.target.value }))}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Theoretical Cost: <span className="font-mono font-semibold">${Number(theoreticalCost).toFixed(2)}</span> · 
                        Gross Profit: <span className="font-mono">${(liveSellingPrice - theoreticalCost).toFixed(2)}</span> · 
                        Food Cost: <span className="font-mono">{liveSellingPrice > 0 ? ((theoreticalCost / liveSellingPrice) * 100).toFixed(1) : "0.0"}%</span>
                      </p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowPriceForm(false)}>Cancel</Button>
                      <Button onClick={handleAddPricing}>Add</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit menu item dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Menu Item</DialogTitle>
            <DialogDescription>Update the menu item details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={handleEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
