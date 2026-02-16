import { useCallback, useState } from "react";
import { Upload, X, ScanLine, Loader2, Check, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Supplier } from "@/hooks/useInvoiceData";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface ScannedLineItem {
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  tax_amount: string;
}

interface ScannedInvoice {
  supplier_name: string;
  supplier_id: string;
  venue: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  notes: string;
  line_items: ScannedLineItem[];
}

interface InvoiceScannerProps {
  suppliers: Supplier[];
  onSave: (invoice: {
    supplier_id: string;
    venue: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string | null;
    notes: string | null;
  }, lineItems: {
    description: string;
    category_id: null;
    quantity: number;
    unit: string | null;
    unit_price: number;
    tax_amount: number;
    total: number;
    notes: null;
  }[]) => Promise<any>;
  onCreateSupplier: (supplier: Omit<Supplier, "id">) => Promise<any>;
  onClose: () => void;
  userId: string;
}

const emptyLine: ScannedLineItem = { description: "", quantity: "1", unit: "", unit_price: "0", tax_amount: "0" };

const InvoiceScanner = ({ suppliers, onSave, onCreateSupplier, onClose, userId }: InvoiceScannerProps) => {
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [extracted, setExtracted] = useState<ScannedInvoice | null>(null);
  const [saving, setSaving] = useState(false);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: "Maximum 10MB allowed.", variant: "destructive" });
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Unsupported format", description: "Please upload an image (JPG, PNG) or PDF.", variant: "destructive" });
      return;
    }

    setScanning(true);
    setExtracted(null);

    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("parse-invoice", {
        body: { fileBase64: base64, mimeType: file.type },
      });

      if (error || !data?.success) {
        toast({ title: "Scan failed", description: data?.error || error?.message || "Could not extract data.", variant: "destructive" });
        setScanning(false);
        return;
      }

      const raw = data.data;

      // Match or auto-create supplier
      let supplierId = "";
      if (raw.supplier_name) {
        const match = suppliers.find((s) => s.name.toLowerCase() === raw.supplier_name.toLowerCase());
        if (match) {
          supplierId = match.id;
        } else {
          const created = await onCreateSupplier({ name: raw.supplier_name, contact_person: null, email: null, phone: null, address: null, notes: null, is_active: true });
          if (created) supplierId = created.id;
        }
      }

      const lines: ScannedLineItem[] = (raw.line_items || []).map((li: any) => ({
        description: li.description || "",
        quantity: String(li.quantity || 1),
        unit: li.unit || "",
        unit_price: String(li.unit_price || 0),
        tax_amount: "0",
      }));

      setExtracted({
        supplier_name: raw.supplier_name || "",
        supplier_id: supplierId,
        venue: raw.venue || "Assembly",
        invoice_number: raw.invoice_number || "",
        invoice_date: raw.invoice_date || "",
        due_date: "",
        notes: raw.notes || "",
        line_items: lines.length > 0 ? lines : [{ ...emptyLine }],
      });

      toast({ title: "Invoice scanned!", description: `Found ${lines.length} line items. Review and save.` });
    } catch (err) {
      console.error("Invoice scan error:", err);
      toast({ title: "Scan failed", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [suppliers, onCreateSupplier]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const updateField = (field: keyof ScannedInvoice, value: string) => {
    setExtracted((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const updateLine = (i: number, field: string, value: string) => {
    setExtracted((prev) => {
      if (!prev) return prev;
      const lines = [...prev.line_items];
      (lines[i] as any)[field] = value;
      return { ...prev, line_items: lines };
    });
  };

  const addLine = () => setExtracted((prev) => prev ? { ...prev, line_items: [...prev.line_items, { ...emptyLine }] } : prev);
  const removeLine = (i: number) => setExtracted((prev) => {
    if (!prev || prev.line_items.length <= 1) return prev;
    return { ...prev, line_items: prev.line_items.filter((_, idx) => idx !== i) };
  });

  const subtotal = extracted?.line_items.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0) || 0;
  const taxTotal = extracted?.line_items.reduce((s, l) => s + (parseFloat(l.tax_amount) || 0), 0) || 0;

  const handleSave = async () => {
    if (!extracted) return;
    if (!extracted.supplier_id) { toast({ title: "Supplier required", variant: "destructive" }); return; }
    if (!extracted.invoice_number) { toast({ title: "Invoice number required", variant: "destructive" }); return; }
    if (!extracted.invoice_date) { toast({ title: "Invoice date required", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const lines = extracted.line_items.filter((l) => l.description.trim()).map((l) => {
        const qty = parseFloat(l.quantity) || 0;
        const price = parseFloat(l.unit_price) || 0;
        const tax = parseFloat(l.tax_amount) || 0;
        return { description: l.description, category_id: null as null, quantity: qty, unit: l.unit || null, unit_price: price, tax_amount: tax, total: qty * price + tax, notes: null as null };
      });

      await onSave(
        {
          supplier_id: extracted.supplier_id,
          venue: extracted.venue,
          invoice_number: extracted.invoice_number,
          invoice_date: extracted.invoice_date,
          due_date: extracted.due_date || null,
          notes: extracted.notes || null,
        },
        lines
      );
      toast({ title: "Invoice saved!" });
      setExtracted(null);
      setTimeout(onClose, 500);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-glass rounded-xl p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          Scan Invoice
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Drop zone */}
      {!extracted && !scanning && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
          }`}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*,application/pdf";
            input.onchange = (e: any) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
            };
            input.click();
          }}
        >
          <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop your invoice here or <span className="text-primary font-medium">click to browse</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, PDF (max 10MB)</p>
        </div>
      )}

      {/* Scanning */}
      {scanning && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Scanning invoice with AI...</p>
        </div>
      )}

      {/* Review form */}
      {extracted && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Review and correct the extracted data, then click Save.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={extracted.supplier_id} onValueChange={(v) => updateField("supplier_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Venue</Label>
              <Select value={extracted.venue} onValueChange={(v) => updateField("venue", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Assembly">Assembly</SelectItem>
                  <SelectItem value="Caliente">Caliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Invoice #</Label>
              <Input value={extracted.invoice_number} onChange={(e) => updateField("invoice_number", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Invoice Date</Label>
              <Input type="date" value={extracted.invoice_date} onChange={(e) => updateField("invoice_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={extracted.due_date} onChange={(e) => updateField("due_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={extracted.notes} onChange={(e) => updateField("notes", e.target.value)} rows={1} />
            </div>
          </div>

          <h4 className="text-sm font-semibold">Line Items</h4>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {extracted.line_items.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_60px_80px_80px_32px] gap-2 items-end">
                <div>
                  {i === 0 && <Label className="text-xs">Description</Label>}
                  <Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Item" className="text-sm" />
                </div>
                <div>
                  {i === 0 && <Label className="text-xs">Qty</Label>}
                  <Input type="number" value={line.quantity} onChange={(e) => updateLine(i, "quantity", e.target.value)} className="text-sm" />
                </div>
                <div>
                  {i === 0 && <Label className="text-xs">Unit</Label>}
                  <Input value={line.unit} onChange={(e) => updateLine(i, "unit", e.target.value)} placeholder="kg" className="text-sm" />
                </div>
                <div>
                  {i === 0 && <Label className="text-xs">Price</Label>}
                  <Input type="number" value={line.unit_price} onChange={(e) => updateLine(i, "unit_price", e.target.value)} className="text-sm" />
                </div>
                <div>
                  {i === 0 && <Label className="text-xs">Tax</Label>}
                  <Input type="number" value={line.tax_amount} onChange={(e) => updateLine(i, "tax_amount", e.target.value)} className="text-sm" />
                </div>
                <div>
                  {extracted.line_items.length > 1 && (
                    <Button size="icon" variant="ghost" onClick={() => removeLine(i)} className="h-9 w-9"><Trash2 className="h-3 w-3" /></Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Add Line</Button>

          <div className="text-right text-sm border-t pt-2">
            <span className="text-muted-foreground">Subtotal: </span>
            <span className="font-mono font-medium">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            {taxTotal > 0 && (
              <>
                <span className="text-muted-foreground ml-4">Tax: </span>
                <span className="font-mono font-medium">{taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </>
            )}
            <span className="text-muted-foreground ml-4">Total: </span>
            <span className="font-mono font-bold">{(subtotal + taxTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              {saving ? "Saving..." : "Save Invoice"}
            </Button>
            <Button variant="outline" onClick={() => setExtracted(null)}>Scan Another</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceScanner;
