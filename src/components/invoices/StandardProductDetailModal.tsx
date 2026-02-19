import React, { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Pencil, Save, Trash2 } from "lucide-react";
import { StandardProduct, PackConversion, SupplierItemMapping } from "@/hooks/useStandardProducts";

interface PurchaseHistoryItem {
  date: string;
  supplier: string;
  invoice_number: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
}

interface Props {
  product: StandardProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversions: PackConversion[];
  mappings: SupplierItemMapping[];
  onUpdateProduct: (id: string, updates: Partial<Omit<StandardProduct, "id" | "created_at" | "updated_at">>) => Promise<boolean>;
  onUpdateMapping: (id: string, updates: Partial<Omit<SupplierItemMapping, "id" | "created_at" | "updated_at" | "supplier_name" | "standard_product_name">>) => Promise<boolean>;
  onDeleteMapping: (id: string) => Promise<boolean>;
  fetchPurchaseHistory: (productId: string) => Promise<PurchaseHistoryItem[]>;
}

const CATEGORIES = ["Food", "Drinks", "Other"];
const BASE_UNITS = ["each", "bottle", "ml", "g", "kg", "case", "box", "can", "pack"];

export default function StandardProductDetailModal({
  product, open, onOpenChange,
  conversions, mappings,
  onUpdateProduct, onUpdateMapping, onDeleteMapping,
  fetchPurchaseHistory,
}: Props) {
  const [tab, setTab] = useState("details");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", category: "Other", sub_category: "", base_unit: "each", reorder_level: "", is_active: true });
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const productConversions = useMemo(() => product ? conversions.filter((c) => c.standard_product_id === product.id) : [], [product, conversions]);
  const productMappings = useMemo(() => product ? mappings.filter((m) => m.standard_product_id === product.id) : [], [product, mappings]);

  useEffect(() => {
    if (product && open) {
      setForm({
        name: product.name,
        category: product.category,
        sub_category: product.sub_category || "",
        base_unit: product.base_unit,
        reorder_level: product.reorder_level ? String(product.reorder_level) : "",
        is_active: product.is_active,
      });
      setEditing(false);
      setTab("details");
      // Fetch purchase history
      setLoadingHistory(true);
      fetchPurchaseHistory(product.id).then((h) => { setHistory(h); setLoadingHistory(false); });
    }
  }, [product, open, fetchPurchaseHistory]);

  const handleSave = async () => {
    if (!product) return;
    await onUpdateProduct(product.id, {
      name: form.name.trim(),
      category: form.category,
      sub_category: form.sub_category.trim() || null,
      base_unit: form.base_unit,
      reorder_level: form.reorder_level ? parseFloat(form.reorder_level) : null,
      is_active: form.is_active,
    });
    setEditing(false);
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {product.name}
            <Badge variant="outline">{product.category}</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="mappings" className="flex-1">Supplier Mappings ({productMappings.length})</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">Purchase History ({history.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="flex justify-end">
              {editing ? (
                <Button size="sm" onClick={handleSave}><Save className="h-3.5 w-3.5 mr-1" />Save</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!editing} />
              </div>
              <div>
                <Label>Category</Label>
                {editing ? (
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <Input value={form.category} disabled />}
              </div>
              <div>
                <Label>Sub-category</Label>
                <Input value={form.sub_category} onChange={(e) => setForm({ ...form, sub_category: e.target.value })} disabled={!editing} />
              </div>
              <div>
                <Label>Base Unit</Label>
                {editing ? (
                  <Select value={form.base_unit} onValueChange={(v) => setForm({ ...form, base_unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{BASE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <Input value={form.base_unit} disabled />}
              </div>
              <div>
                <Label>Reorder Level</Label>
                <Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} disabled={!editing} />
              </div>
              {editing && (
                <div className="col-span-2 flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label>Active</Label>
                </div>
              )}
            </div>
            {productConversions.length > 0 && (
              <div>
                <Label>Conversion Rules</Label>
                <div className="space-y-1 mt-1">
                  {productConversions.map((c) => (
                    <div key={c.id} className="text-sm bg-muted/50 rounded px-2 py-1">
                      1 {c.from_unit} = {c.conversion_factor} {c.to_unit}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="mappings" className="space-y-3">
            {productMappings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No supplier mappings yet</p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Item Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Qty/Unit</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productMappings.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.supplier_name}</TableCell>
                        <TableCell className="font-medium">{m.supplier_item_name}</TableCell>
                        <TableCell className="text-muted-foreground">{m.supplier_sku || "—"}</TableCell>
                        <TableCell>{m.purchase_unit}</TableCell>
                        <TableCell className="font-mono">{m.quantity_per_unit}</TableCell>
                        <TableCell className="text-right font-mono">{m.default_unit_price ? `$${m.default_unit_price.toFixed(2)}` : "—"}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDeleteMapping(m.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {loadingHistory ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No purchase history</p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h, i) => (
                      <TableRow key={i}>
                        <TableCell>{h.date}</TableCell>
                        <TableCell>{h.supplier}</TableCell>
                        <TableCell className="font-medium">{h.invoice_number}</TableCell>
                        <TableCell className="text-right font-mono">{h.quantity}</TableCell>
                        <TableCell>{h.unit || "—"}</TableCell>
                        <TableCell className="text-right font-mono">${Number(h.unit_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">${Number(h.total).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
