import React, { useState, useEffect, useCallback } from "react";
import { useMenuCosting, MenuItem, MenuItemIngredient, MenuItemPricing } from "@/hooks/useMenuCosting";
import { useProductMaster, ProductMasterItem } from "@/hooks/useProductMaster";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, ChefHat, Info } from "lucide-react";
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

  // Live preview for ingredient form
  const selectedPm = products.find(p => p.id === ingForm.product_master_id);
  const liveQty = parseFloat(ingForm.quantity_used) || 0;
  const liveRefCost = selectedPm?.cost_per_base_unit ?? 0;
  const liveLineCost = liveQty * liveRefCost;

  // Live preview for pricing form
  const liveSellingPrice = parseFloat(priceForm.selling_price) || 0;

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
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />Add Menu Item</Button>
      </div>

      {/* Menu items table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Theoretical Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : menuItems.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No menu items yet</TableCell></TableRow>
            ) : menuItems.map(item => (
              <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => loadDetail(item)}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell className="text-right font-mono">${Number(item.theoretical_cost).toFixed(2)}</TableCell>
                <TableCell><Badge variant={item.status === "Active" ? "default" : "secondary"}>{item.status}</Badge></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}
