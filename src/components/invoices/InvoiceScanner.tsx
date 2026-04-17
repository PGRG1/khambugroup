import React, { useCallback, useState, useEffect, useMemo } from "react";
import { Upload, X, ScanLine, Loader2, Check, Trash2, Plus, ChevronLeft, ChevronRight, Camera, FileText, AlertTriangle } from "lucide-react";
import InvoiceCamera from "./InvoiceCamera";
import ProductAutocomplete from "./ProductAutocomplete";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Supplier } from "@/hooks/useInvoiceData";
import { compressImageFile } from "@/utils/imageCompression";
import { resolveProductMatch } from "@/utils/productMasterResolver";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

interface ProductMasterEntry {
  id: string;
  internal_sku: string;
  external_sku: string;
  internal_product_name: string;
  supplier_product_name: string;
  purchase_unit_cost?: number;
  supplier?: string;
  purchase_unit?: string;
  stock_uom?: string;
  stock_qty?: number;
}

interface ScannedLineItem {
  item_code: string;
  description: string;
  pack_size: string;
  quantity: string;
  unit: string;
  weight: string;
  unit_price: string;
  discount: string;
  tax_amount: string;
  total: string;
  matched_sku: string;
  matched_internal_name: string;
  matched_stock_uom: string;
  matched_purchase_uom: string;
  matched_stock_qty_ratio: number;
  sku_mismatch?: boolean;
  unmatched?: boolean;
  price_changed?: boolean;
  pm_unit_price?: number;
}

interface ScannedInvoice {
  supplier_name: string;
  supplier_id: string;
  venue: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  notes: string;
  invoice_status: string;
  invoice_discount: string;
  line_items: ScannedLineItem[];
  saved?: boolean;
  sourceFiles?: File[];
  ai_total?: number;
  is_duplicate?: boolean;
  duplicate_date?: string;
}

interface InvoiceScannerProps {
  suppliers: Supplier[];
  productMaster?: ProductMasterEntry[];
  onSave: (invoice: {
    supplier_id: string;
    venue: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string | null;
    notes: string | null;
    discount?: number;
    status?: string;
  }, lineItems: {
    item_code: string;
    description: string;
    pack_size: string;
    category_id: null;
    quantity: number;
    unit: string | null;
    weight: number | null;
    unit_price: number;
    discount: number;
    tax_amount: number;
    total: number;
    notes: null;
    product_master_id: string | null;
  }[], files?: File[]) => Promise<any>;
  
  onClose: () => void;
  userId: string;
}

const emptyLine: ScannedLineItem = {
  item_code: "", description: "", pack_size: "", quantity: "1", unit: "", weight: "",
  unit_price: "0", discount: "0", tax_amount: "0", total: "0", matched_sku: "",
  matched_internal_name: "", matched_stock_uom: "", matched_purchase_uom: "", matched_stock_qty_ratio: 1,
  unmatched: false, price_changed: false,
};

const InvoiceScanner = ({ suppliers, productMaster, onSave, onClose, userId }: InvoiceScannerProps) => {
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [invoices, setInvoices] = useState<ScannedInvoice[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });

  const current = invoices[currentIdx] || null;

  const normalizeSupplierName = (value: string) =>
    value
      .toLowerCase()
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
      .replace(/\b(limited|ltd|co|company)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const productMasterSupplierOptions = useMemo(() => {
    const productMasterNames = Array.from(
      new Set(
        (productMaster || [])
          .map((entry) => entry.supplier?.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim())
          .filter((name): name is string => Boolean(name))
      )
    ).sort((a, b) => a.localeCompare(b));

    const options = (productMasterNames.length > 0 ? productMasterNames : suppliers.map((supplier) => supplier.name))
      .map((name) => {
        const normalizedName = normalizeSupplierName(name);
        const matchedSupplier = suppliers.find((supplier) => normalizeSupplierName(supplier.name) === normalizedName)
          ?? suppliers.find((supplier) => {
            const normalizedSupplierName = normalizeSupplierName(supplier.name);
            return normalizedSupplierName.includes(normalizedName) || normalizedName.includes(normalizedSupplierName);
          });

        return {
          label: name,
          value: matchedSupplier?.id ?? `pm:${name}`,
        };
      })
      .filter((option, index, allOptions) => allOptions.findIndex((candidate) => candidate.label === option.label) === index);

    if (current?.supplier_id && !options.some((option) => option.value === current.supplier_id)) {
      const currentSupplier = suppliers.find((supplier) => supplier.id === current.supplier_id);
      if (currentSupplier) {
        return [{ label: currentSupplier.name, value: currentSupplier.id }, ...options];
      }
    }

    return options;
  }, [current?.supplier_id, productMaster, suppliers]);

  // Sort product master: supplier matches first, then everything else
  const supplierFilteredPM = useMemo(() => {
    if (!productMaster || !current) return productMaster || [];
    const supplierName = current.supplier_name || "";
    if (!supplierName) return productMaster;
    const normSupplier = normalizeSupplierName(supplierName);
    return [...productMaster].sort((a, b) => {
      const aMatch = a.supplier && (() => { const n = normalizeSupplierName(a.supplier!); return n === normSupplier || n.includes(normSupplier) || normSupplier.includes(n); })() ? 0 : 1;
      const bMatch = b.supplier && (() => { const n = normalizeSupplierName(b.supplier!); return n === normSupplier || n.includes(normSupplier) || normSupplier.includes(n); })() ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [productMaster, current?.supplier_name]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const matchSupplier = useCallback((supplierName: string): string => {
    if (!supplierName) return "";
    const normalised = supplierName.trim().toLowerCase();
    const exactMatch = suppliers.find((s) => s.name.toLowerCase() === normalised);
    if (exactMatch) return exactMatch.id;
    const normInput = normalizeSupplierName(supplierName);
    const normMatch = suppliers.find((s) => normalizeSupplierName(s.name) === normInput);
    if (normMatch) return normMatch.id;
    const partialMatch = suppliers.find((s) => {
      const ns = normalizeSupplierName(s.name);
      return ns.includes(normInput) || normInput.includes(ns);
    });
    if (partialMatch) return partialMatch.id;
    return "";
  }, [suppliers]);

  const checkDuplicates = useCallback(async (invoicesToCheck: ScannedInvoice[]) => {
    const updates: { idx: number; isDuplicate: boolean; date?: string }[] = [];
    for (let i = 0; i < invoicesToCheck.length; i++) {
      const inv = invoicesToCheck[i];
      if (!inv.invoice_number || !inv.supplier_id) continue;
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_date")
        .eq("invoice_number", inv.invoice_number)
        .eq("supplier_id", inv.supplier_id)
        .limit(1);
      if (data && data.length > 0) {
        updates.push({ idx: i, isDuplicate: true, date: data[0].invoice_date });
      }
    }
    if (updates.length > 0) {
      setInvoices(prev => {
        const copy = [...prev];
        for (const u of updates) {
          copy[u.idx] = { ...copy[u.idx], is_duplicate: u.isDuplicate, duplicate_date: u.date };
        }
        return copy;
      });
    }
  }, []);

  // Resolve PM data for a matched line — uses shared resolver with SKU-first priority
  const resolvePMData = useCallback((itemCode: string, matchedSku: string, pm: ProductMasterEntry[] | undefined, supplierName?: string) => {
    if (!pm) return { internal_name: "", stock_uom: "", purchase_uom: "", stock_qty_ratio: 1, entry: null as ProductMasterEntry | null };
    const entry = resolveProductMatch(
      { itemCode, internalSku: matchedSku },
      pm,
      supplierName,
    );
    if (!entry) return { internal_name: "", stock_uom: "", purchase_uom: "", stock_qty_ratio: 1, entry: null };
    return {
      internal_name: entry.internal_product_name,
      stock_uom: entry.stock_uom || "",
      purchase_uom: entry.purchase_unit || "",
      stock_qty_ratio: entry.stock_qty ?? 1,
      entry,
    };
  }, []);

  const flagLineItemIssues = useCallback((lines: ScannedLineItem[], pm: ProductMasterEntry[] | undefined, supplierName?: string): ScannedLineItem[] => {
    if (!pm) return lines.map(line => ({ ...line, unmatched: true }));
    return lines.map(line => {
      let workingLine = { ...line };

      // Use shared resolver to find the best match
      const resolved = resolveProductMatch(
        {
          itemCode: workingLine.item_code,
          description: workingLine.description,
          internalSku: workingLine.matched_sku || undefined,
        },
        pm,
        supplierName,
      );

      if (resolved) {
        workingLine.matched_sku = resolved.internal_sku;
        // Only auto-fill external SKU if supplier matches
        const matchSupplierOk = supplierName && resolved.supplier &&
          normalizeSupplierName(resolved.supplier) === normalizeSupplierName(supplierName);
        if (matchSupplierOk && !workingLine.item_code) {
          workingLine.item_code = resolved.external_sku || "";
        }
      }

      if (!resolved) {
        return { ...workingLine, sku_mismatch: false, unmatched: true, price_changed: false, matched_sku: "", matched_internal_name: "", matched_stock_uom: "", matched_purchase_uom: "", matched_stock_qty_ratio: 1 };
      }

      // SKU mismatch check
      const scannedCode = (workingLine.item_code || "").trim().toLowerCase();
      const allExtSkus = pm
        .filter(p => p.internal_sku === resolved.internal_sku)
        .map(p => (p.external_sku || "").trim().toLowerCase())
        .filter(Boolean);
      const skuMatches = !scannedCode || allExtSkus.length === 0
        || allExtSkus.some(sku =>
          scannedCode === sku || sku.includes(scannedCode) || scannedCode.includes(sku)
          || sku.split("|").some(seg => seg.trim() === scannedCode)
        );
      const skuMismatch = !!(scannedCode && allExtSkus.length > 0 && !skuMatches);

      const scannedPrice = parseFloat(workingLine.unit_price) || 0;
      const pmPrice = resolved.purchase_unit_cost ?? 0;
      const priceChanged = pmPrice > 0 && Math.abs(scannedPrice - pmPrice) > 0.01;

      // If matched via external SKU, always override description from the PM entry
      const hasItemCode = (workingLine.item_code || "").trim();
      const autoDescription = resolved.supplier_product_name || resolved.internal_product_name || "";
      const shouldOverrideDesc = hasItemCode && autoDescription;

      return {
        ...workingLine,
        description: shouldOverrideDesc ? autoDescription : (workingLine.description || autoDescription),
        matched_sku: resolved.internal_sku,
        sku_mismatch: skuMismatch,
        unmatched: false,
        price_changed: priceChanged,
        pm_unit_price: pmPrice > 0 ? pmPrice : undefined,
        matched_internal_name: resolved.internal_product_name || "",
        matched_stock_uom: resolved.stock_uom || "",
        matched_purchase_uom: resolved.purchase_unit || "",
        matched_stock_qty_ratio: resolved.stock_qty ?? 1,
      };
    });
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File too large", description: "Maximum 100MB allowed.", variant: "destructive" });
      return [];
    }
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Unsupported format", description: "Please upload an image (JPG, PNG) or PDF.", variant: "destructive" });
      return [];
    }
    const compressedFile = await compressImageFile(file);
    try {
      const base64 = await fileToBase64(compressedFile);
      return { base64, mimeType: compressedFile.type, compressedFile };
    } catch (err) {
      console.error("File processing error:", err);
      toast({ title: "Failed to process", description: `Failed to process ${file.name}.`, variant: "destructive" });
      return null;
    }
  }, []);

  const processMultipleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setScanning(true);
    setInvoices([]);
    setCurrentIdx(0);
    setSavedCount(0);
    
    setScanProgress({ current: 0, total: files.length });

    try {
      const preparedFiles: { base64: string; mimeType: string; compressedFile: File }[] = [];

      for (let i = 0; i < files.length; i++) {
        setScanProgress({ current: i + 1, total: files.length });
        const result = await processFile(files[i]);
        if (result && !Array.isArray(result)) {
          preparedFiles.push(result);
        }
      }

      if (preparedFiles.length === 0) return;

      const { data, error } = await supabase.functions.invoke("parse-invoice", {
        body: {
          files: preparedFiles.map((file) => ({ base64: file.base64, mimeType: file.mimeType })),
          productMaster: productMaster || [],
          userId,
        },
      });

      if (error) throw error;

      const rawInvoices = Array.isArray(data) ? data : Array.isArray(data?.invoices) ? data.invoices : Array.isArray(data?.data?.invoices) ? data.data.invoices : [];

      const parsedInvoices: ScannedInvoice[] = [];
      for (const raw of rawInvoices) {
        const supplierName = raw?.supplier_name || "";
        const supplierId = matchSupplier(supplierName);
        const lineItems = flagLineItemIssues(
          (raw?.line_items || []).map((li: any) => {
            const matchedSku = li?.matched_sku || "";
            const itemCode = li?.item_code || "";
            const pmData = resolvePMData(itemCode, matchedSku, productMaster, supplierName);
            // If resolved by SKU, override description with the authoritative PM name
            const resolvedDesc = pmData.entry
              ? (pmData.entry.supplier_product_name || pmData.entry.internal_product_name || li?.description || "")
              : (li?.description || "");
            const isBW = supplierName.toLowerCase().includes("beverage world");
            const rawTotal = ((Number(li?.quantity) || 0) * (Number(li?.unit_price) || 0)) - (Number(li?.discount) || 0) + (Number(li?.tax_amount) || 0);
            const totalStr = isBW ? String(Math.round(rawTotal)) : rawTotal.toFixed(2);
            return {
              item_code: itemCode,
              description: itemCode && pmData.entry ? resolvedDesc : (li?.description || ""),
              pack_size: li?.pack_size || "",
              quantity: String(li?.quantity ?? "1"),
              unit: li?.unit || "",
              weight: li?.weight != null ? String(li.weight) : "",
              unit_price: String(li?.unit_price ?? "0"),
              discount: String(li?.discount ?? "0"),
              tax_amount: String(li?.tax_amount ?? "0"),
              total: totalStr,
              matched_sku: pmData.entry?.internal_sku || matchedSku,
              matched_internal_name: pmData.internal_name,
              matched_stock_uom: pmData.stock_uom,
              matched_purchase_uom: pmData.purchase_uom,
              matched_stock_qty_ratio: pmData.stock_qty_ratio,
            };
          }),
          productMaster,
          supplierName
        );

        parsedInvoices.push({
          supplier_name: supplierName,
          supplier_id: supplierId,
          venue: raw?.venue || "Hanabi",
          invoice_number: raw?.invoice_number || "",
          invoice_date: raw?.invoice_date || "",
          due_date: raw?.due_date || "",
          notes: "",
          invoice_status: "outstanding",
          invoice_discount: "0",
          line_items: lineItems.length > 0 ? lineItems : [{ ...emptyLine }],
          sourceFiles: files,
          ai_total: raw?.total_amount ?? raw?.ai_total,
        });
      }

      setInvoices(parsedInvoices);
      await checkDuplicates(parsedInvoices);
    } catch (err: any) {
      console.error("Invoice scan error:", err);
      toast({
        title: "Scan failed",
        description: err?.message || "Could not scan invoice files.",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
      setScanProgress({ current: 0, total: 0 });
    }
  }, [checkDuplicates, flagLineItemIssues, matchSupplier, processFile, productMaster, resolvePMData, userId]);

  const recheckDuplicate = useCallback(async (idx: number, invoiceNumber: string, supplierId: string) => {
    if (!invoiceNumber || !supplierId) {
      setInvoices(prev => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], is_duplicate: false, duplicate_date: undefined };
        return copy;
      });
      return;
    }
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_date")
      .eq("invoice_number", invoiceNumber)
      .eq("supplier_id", supplierId)
      .limit(1);
    setInvoices(prev => {
      const copy = [...prev];
      if (data && data.length > 0) {
        copy[idx] = { ...copy[idx], is_duplicate: true, duplicate_date: data[0].invoice_date };
      } else {
        copy[idx] = { ...copy[idx], is_duplicate: false, duplicate_date: undefined };
      }
      return copy;
    });
  }, []);

  const updateField = (field: keyof ScannedInvoice, value: string) => {
    const targetIdx = currentIdx;
    setInvoices((prev) => {
      const copy = [...prev];
      copy[targetIdx] = { ...copy[targetIdx], [field]: value };
      return copy;
    });
    if (field === "invoice_number") {
      const inv = invoices[targetIdx];
      recheckDuplicate(targetIdx, value, inv?.supplier_id || "");
    }
  };

  const handleSupplierChange = (value: string) => {
    const targetIdx = currentIdx;
    if (value.startsWith("pm:")) {
      return; // Suppliers must be added manually via the Suppliers tab
    }
    const selectedSupplier = suppliers.find((supplier) => supplier.id === value);
    setInvoices((prev) => {
      const copy = [...prev];
      const newSupplierName = selectedSupplier?.name || copy[targetIdx].supplier_name;
      const isBW = (newSupplierName || "").toLowerCase().includes("beverage world");
      const recomputedLines = (copy[targetIdx].line_items || []).map((line) => {
        const raw = ((Number(line.quantity) || 0) * (Number(line.unit_price) || 0)) - (Number(line.discount) || 0) + (Number(line.tax_amount) || 0);
        return { ...line, total: isBW ? String(Math.round(raw)) : raw.toFixed(2) };
      });
      copy[targetIdx] = {
        ...copy[targetIdx],
        supplier_id: value,
        supplier_name: newSupplierName,
        line_items: recomputedLines,
      };
      return copy;
    });
    const inv = invoices[targetIdx];
    recheckDuplicate(targetIdx, inv?.invoice_number || "", value);
  };

  const updateLine = (i: number, field: string, value: string) => {
    setInvoices((prev) => {
      const copy = [...prev];
      const lines = [...copy[currentIdx].line_items];
      let line = { ...lines[i], [field]: value };

      // When item_code or description changes manually, treat as free text.
      // Clear any prior PM linkage so edits stick. Re-linking happens at save time
      // (or when the user explicitly picks an autocomplete suggestion).
      if (field === "item_code" || field === "description") {
        line.matched_sku = "";
        line.matched_internal_name = "";
        line.matched_stock_uom = "";
        line.matched_purchase_uom = "";
        line.matched_stock_qty_ratio = 1;
        line.sku_mismatch = false;
        line.price_changed = false;
        line.pm_unit_price = undefined;
        line.unmatched = Boolean((line.item_code || "").trim() || (line.description || "").trim());
      }

      if (["quantity", "weight", "unit_price", "discount", "tax_amount"].includes(field)) {
        const w = line.weight ? parseFloat(line.weight) : null;
        const price = parseFloat(line.unit_price) || 0;
        const qty = parseFloat(line.quantity) || 0;
        const disc = parseFloat(line.discount) || 0;
        const tax = parseFloat(line.tax_amount) || 0;
        const supplierName = copy[currentIdx].supplier_name || "";
        const isBW = supplierName.toLowerCase().includes("beverage world");
        const raw = (qty * price) - disc + tax;
        line.total = isBW ? String(Math.round(raw)) : String(raw.toFixed(2));
      }
      if (["unit_price", "matched_sku"].includes(field)) {
        const flagged = flagLineItemIssues([line], productMaster, copy[currentIdx].supplier_name);
        lines[i] = flagged[0];
      } else {
        lines[i] = line;
      }
      copy[currentIdx] = { ...copy[currentIdx], line_items: lines };
      return copy;
    });
  };

  const selectProduct = (i: number, product: ProductMasterEntry) => {
    setInvoices((prev) => {
      const copy = [...prev];
      const lines = [...copy[currentIdx].line_items];
      const currentLine = lines[i];
      const scannedPrice = parseFloat(currentLine.unit_price) || 0;
      const pmPrice = product.purchase_unit_cost ?? 0;
      // Directly set all fields from the selected product — no re-resolution
      lines[i] = {
        ...currentLine,
        item_code: product.external_sku || currentLine.item_code,
        description: product.supplier_product_name || product.internal_product_name || currentLine.description,
        matched_sku: product.internal_sku,
        matched_internal_name: product.internal_product_name || "",
        matched_stock_uom: product.stock_uom || "",
        matched_purchase_uom: product.purchase_unit || "",
        matched_stock_qty_ratio: product.stock_qty ?? 1,
        unmatched: false,
        sku_mismatch: false,
        price_changed: pmPrice > 0 && Math.abs(scannedPrice - pmPrice) > 0.01,
        pm_unit_price: pmPrice > 0 ? pmPrice : undefined,
      };
      copy[currentIdx] = { ...copy[currentIdx], line_items: lines };
      return copy;
    });
  };

  const addLine = () => setInvoices((prev) => {
    const copy = [...prev];
    copy[currentIdx] = { ...copy[currentIdx], line_items: [...copy[currentIdx].line_items, { ...emptyLine }] };
    return copy;
  });

  const removeLine = (i: number) => setInvoices((prev) => {
    const copy = [...prev];
    if (copy[currentIdx].line_items.length <= 1) return prev;
    copy[currentIdx] = { ...copy[currentIdx], line_items: copy[currentIdx].line_items.filter((_, idx) => idx !== i) };
    return copy;
  });

  const calcLineTotal = (l: ScannedLineItem) => {
    const price = parseFloat(l.unit_price) || 0;
    const qty = parseFloat(l.quantity) || 0;
    const disc = parseFloat(l.discount) || 0;
    const tax = parseFloat(l.tax_amount) || 0;
    const raw = qty * price - disc + tax;
    const supplierName = current?.supplier_name || "";
    return supplierName.toLowerCase().includes("beverage world") ? Math.round(raw) : raw;
  };

  const lineItemsTotal = current?.line_items.reduce((s, l) => s + calcLineTotal(l), 0) || 0;
  const taxTotal = current?.line_items.reduce((s, l) => s + (parseFloat(l.tax_amount) || 0), 0) || 0;
  const invoiceDiscount = parseFloat(current?.invoice_discount || "0") || 0;
  const subtotal = lineItemsTotal;
  const calculatedTotal = lineItemsTotal - invoiceDiscount;

  const currentSupplierName = current ? (suppliers.find(s => s.id === current.supplier_id)?.name || "") : "";
  const isBeverageWorld = currentSupplierName.toLowerCase().includes("beverage world");
  const displayTotal = isBeverageWorld ? Math.round(calculatedTotal) : parseFloat(calculatedTotal.toFixed(2));

  const aiTotal = current?.ai_total;
  const totalMismatch = aiTotal !== undefined && Math.abs(aiTotal - calculatedTotal) > 0.50;

  const doSaveCurrent = async (inv: ScannedInvoice, idx: number, skipDuplicateCheck = false) => {
    if (!skipDuplicateCheck) {
      const { data: existingInvoices } = await supabase
        .from("invoices")
        .select("id, invoice_date")
        .eq("invoice_number", inv.invoice_number)
        .eq("supplier_id", inv.supplier_id)
        .limit(1);

      if (existingInvoices && existingInvoices.length > 0) {
        toast({ title: "Duplicate invoice", description: `Invoice #${inv.invoice_number} already exists and cannot be recorded again.`, variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      const supplierName = suppliers.find(s => s.id === inv.supplier_id)?.name || "";
      const isBW = supplierName.toLowerCase().includes("beverage world");

      const lines = inv.line_items.filter((l) => l.description.trim()).map((l) => {
        const qty = parseFloat(l.quantity) || 0;
        const price = parseFloat(l.unit_price) || 0;
        const disc = parseFloat(l.discount) || 0;
        const tax = parseFloat(l.tax_amount) || 0;
        const lineTotal = isBW ? Math.round((qty * price) - disc + tax) : parseFloat(((qty * price) - disc + tax).toFixed(2));
        // Resolve product_master_id using external SKU first, then internal SKU
        let pmId: string | null = null;
        if (productMaster) {
          const resolved = resolveProductMatch(
            { itemCode: l.item_code, internalSku: l.matched_sku || undefined },
            productMaster,
            supplierName,
          );
          if (resolved) pmId = resolved.id;
        }
        return { item_code: l.item_code || "", description: l.description, pack_size: l.pack_size || "", category_id: null as null, quantity: qty, unit: l.unit || null, weight: l.weight ? parseFloat(l.weight) : null, unit_price: price, discount: disc, tax_amount: tax, total: lineTotal, notes: null as null, product_master_id: pmId };
      });

      const dateStr = (inv.invoice_date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
      const vendorName = (suppliers.find((s) => s.id === inv.supplier_id)?.name || "unknown")
        .trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, "_").replace(/_+$/, "");
      const invNum = (inv.invoice_number || "no-number").trim().replace(/[^a-zA-Z0-9]+/g, "_");
      const professionalName = `${dateStr}_${vendorName}_${invNum}`;
      const filesToSave = (inv.sourceFiles || []).map((f, fi) => {
        const ext = f.name.split(".").pop() || "jpg";
        const suffix = (inv.sourceFiles || []).length > 1 ? `_page${fi + 1}` : "";
        return new File([f], `${professionalName}${suffix}.${ext}`, { type: f.type });
      });

      await onSave(
        {
          supplier_id: inv.supplier_id,
          venue: inv.venue,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          due_date: inv.due_date || null,
          notes: inv.notes || null,
          discount: parseFloat(inv.invoice_discount || "0") || 0,
          status: inv.invoice_status || undefined,
        },
        lines,
        filesToSave.length > 0 ? filesToSave : undefined
      );

      setInvoices((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], saved: true };
        return copy;
      });
      setSavedCount((c) => c + 1);
      toast({ title: `Invoice ${inv.invoice_number} saved!` });
      const nextUnsaved = invoices.findIndex((inv2, i2) => i2 > idx && !inv2.saved);
      if (nextUnsaved >= 0) setCurrentIdx(nextUnsaved);
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasUnmatchedForSave = useCallback((inv: ScannedInvoice) => {
    return inv.line_items.some(l => l.description.trim() && l.unmatched);
  }, []);

  const handleSaveCurrent = async () => {
    if (!current) return;
    if (!current.supplier_id) { toast({ title: "Supplier required", variant: "destructive" }); return; }
    if (!current.invoice_number) { toast({ title: "Invoice number required", variant: "destructive" }); return; }
    if (!current.invoice_date) { toast({ title: "Invoice date required", variant: "destructive" }); return; }
    if (hasUnmatchedForSave(current)) { toast({ title: "All items must be matched to Product Master", description: "Match all External SKU / External Name fields before saving.", variant: "destructive" }); return; }
    await doSaveCurrent(current, currentIdx);
  };

  const handleSaveAll = async () => {
    // Check all unsaved invoices for unmatched items
    const unmatchedInvoices = invoices.filter((inv, i) => !inv.saved && !inv.is_duplicate && hasUnmatchedForSave(inv));
    if (unmatchedInvoices.length > 0) {
      toast({ title: "Cannot save all", description: `${unmatchedInvoices.length} invoice(s) have unmatched items. Match all line items to Product Master first.`, variant: "destructive" });
      return;
    }
    setSavingAll(true);
    let saved = 0;
    let skippedDuplicates = 0;
    for (let i = 0; i < invoices.length; i++) {
      if (invoices[i].saved) { saved++; continue; }
      if (invoices[i].is_duplicate) { skippedDuplicates++; continue; }
      try {
        await doSaveCurrent(invoices[i], i, false);
        saved++;
      } catch {
        toast({ title: `Failed to save invoice #${invoices[i].invoice_number}`, variant: "destructive" });
      }
    }
    const msg = skippedDuplicates > 0
      ? `Saved ${saved} of ${invoices.length} invoices. ${skippedDuplicates} duplicate(s) skipped.`
      : `Saved ${saved} of ${invoices.length} invoices!`;
    toast({ title: msg });
    setSavingAll(false);
    if (saved + skippedDuplicates === invoices.length) {
      setTimeout(onClose, 800);
    }
  };

  const totalInvoices = invoices.length;
  const allSaved = totalInvoices > 0 && invoices.every((inv) => inv?.saved);
  const hasSkuMismatches = current?.line_items.some(l => l.sku_mismatch) || false;
  const unmatchedItems = current?.line_items.filter(l => l.unmatched) || [];
  const hasUnmatchedItems = unmatchedItems.length > 0;
  const priceChangedItems = current?.line_items.filter(l => l.price_changed) || [];
  const hasPriceChanges = priceChangedItems.length > 0;

  const addFilesToPending = useCallback((files: File[]) => {
    setPendingFiles((prev) => [...prev, ...files]);
  }, []);

  const openFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,application/pdf";
    input.multiple = true;
    input.onchange = (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      if (files.length > 0) addFilesToPending(files);
    };
    input.click();
  }, [addFilesToPending]);

  const handleDropToStaging = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) addFilesToPending(files);
  }, [addFilesToPending]);

  const [pendingThumbs, setPendingThumbs] = useState<Map<number, string>>(new Map());
  React.useEffect(() => {
    const newThumbs = new Map<number, string>();
    pendingFiles.forEach((f, i) => {
      if (f.type.startsWith("image/")) {
        newThumbs.set(i, URL.createObjectURL(f));
      }
    });
    setPendingThumbs(newThumbs);
    return () => { newThumbs.forEach((url) => URL.revokeObjectURL(url)); };
  }, [pendingFiles]);

  // Status badge color helper
  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "paid": return "bg-green-100 text-green-800 border-green-300";
      case "outstanding": return "bg-amber-100 text-amber-800 border-amber-300";
      case "under_review": return "bg-blue-100 text-blue-800 border-blue-300";
      default: return "bg-muted text-muted-foreground";
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

      {/* Camera mode */}
      {showCamera && !scanning && invoices.length === 0 && (
        <InvoiceCamera
          onCapture={(file) => {
            setShowCamera(false);
            addFilesToPending([file]);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* STEP 1: Add Attachments */}
      {invoices.length === 0 && !scanning && !showCamera && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDropToStaging}
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
            }`}
            onClick={openFilePicker}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop your invoice files here or <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Drop multiple pages of the same invoice — they'll be scanned together as one document.
            </p>
          </div>

          {pendingFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""} selected
                </p>
                <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setPendingFiles([])}>
                  Clear all
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="relative shrink-0 px-2 py-1 rounded-md border border-border bg-muted/50 flex items-center gap-1.5 text-xs">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="max-w-[120px] truncate">{f.name}</span>
                    <button onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  const files = [...pendingFiles];
                  setPendingFiles([]);
                  processMultipleFiles(files);
                }}
              >
                <ScanLine className="h-3 w-3 mr-1" />
                Scan All {pendingFiles.length} File{pendingFiles.length > 1 ? "s" : ""}
              </Button>
            </div>
          )}

          {pendingFiles.length === 0 && (
            <>
              <div className="text-center">
                <span className="text-xs text-muted-foreground">or</span>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setShowCamera(true)}>
                <Camera className="h-4 w-4 mr-2" />
                Take Photos with Camera
              </Button>
            </>
          )}
        </div>
      )}

      {/* Scanning */}
      {scanning && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            {scanProgress.total > 1
              ? `Scanning file ${scanProgress.current} of ${scanProgress.total}...`
              : "Scanning for invoices with AI... This may take a moment for large documents."}
          </p>
          {scanProgress.total > 1 && (
            <Progress value={(scanProgress.current / scanProgress.total) * 100} className="h-2 w-48" />
          )}
        </div>
      )}

      {/* Review form */}
      {current && !scanning && (
        <div className="space-y-4">
          {/* Navigation bar */}
          {totalInvoices > 1 && (
            <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-2">
              <Button variant="ghost" size="sm" disabled={currentIdx === 0} onClick={() => setCurrentIdx(currentIdx - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />Prev
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  Invoice {currentIdx + 1} of {totalInvoices}
                </span>
                {current.saved && <Badge className="bg-green-100 text-green-800 border-green-300">Saved</Badge>}
                {current.is_duplicate && !current.saved && (
                  <Badge variant="destructive" className="text-xs">Duplicate</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" disabled={currentIdx === totalInvoices - 1} onClick={() => setCurrentIdx(currentIdx + 1)}>
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Progress */}
          {totalInvoices > 1 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{savedCount} of {totalInvoices} saved</span>
                <span>{Math.round((savedCount / totalInvoices) * 100)}%</span>
              </div>
              <Progress value={(savedCount / totalInvoices) * 100} className="h-2" />
            </div>
          )}

          {/* Warning banners */}
          {current.is_duplicate && !current.saved && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>Cannot be recorded — already exists:</strong> Invoice #{current.invoice_number} from this supplier
                {current.duplicate_date ? ` (dated ${current.duplicate_date})` : ""} is already in the system.
              </span>
            </div>
          )}

          {totalMismatch && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>Total mismatch:</strong> Invoice total from document (${aiTotal?.toFixed(2)}) doesn't match calculated line items total (${calculatedTotal.toFixed(2)}). Please review the numbers.
              </span>
            </div>
          )}

          {hasUnmatchedItems && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>{unmatchedItems.length} item{unmatchedItems.length > 1 ? "s" : ""} not matched to Product Master</strong> — review required.
              </span>
            </div>
          )}

          {hasSkuMismatches && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>SKU mismatch:</strong> Some scanned item codes don't match the Product Master external SKU. Review highlighted rows.
              </span>
            </div>
          )}

          {hasPriceChanges && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-400 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>{priceChangedItems.length} price change{priceChangedItems.length > 1 ? "s" : ""} detected</strong> — invoice prices differ from Product Master. Review highlighted rows.
              </span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">Review and correct the extracted data, then save.</p>

          {/* Header fields */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={current.supplier_id} onValueChange={handleSupplierChange}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {productMasterSupplierOptions.map((supplier) => (
                    <SelectItem key={supplier.value} value={supplier.value}>{supplier.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Venue</Label>
              <Select value={current.venue} onValueChange={(v) => updateField("venue", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Assembly">Assembly</SelectItem>
                  <SelectItem value="Caliente">Caliente</SelectItem>
                  <SelectItem value="Hanabi">Hanabi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Invoice #</Label>
              <Input value={current.invoice_number} onChange={(e) => updateField("invoice_number", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={current.invoice_status} onValueChange={(v) => updateField("invoice_status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outstanding">Outstanding</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Invoice Date</Label>
              <Input type="date" value={current.invoice_date} onChange={(e) => updateField("invoice_date", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={current.due_date} onChange={(e) => updateField("due_date", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea value={current.notes} onChange={(e) => updateField("notes", e.target.value)} rows={1} />
            </div>
          </div>

          {/* Line Items table */}
          <h4 className="text-sm font-semibold">Line Items ({current.line_items.length})</h4>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs border-collapse min-w-full table-auto">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-7">#</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium whitespace-nowrap">Internal SKU</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium min-w-[180px]">Internal Name</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium whitespace-nowrap">External SKU</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium min-w-[200px]">External Name</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[85px]">Purch. UOM</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium whitespace-nowrap">Purch. Qty</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[85px]">Stock UOM</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium w-[90px]">Stock Qty</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium whitespace-nowrap">Purch. Cost</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium whitespace-nowrap">Discount</th>
                  <th className="text-left px-1 py-1.5 text-muted-foreground font-medium whitespace-nowrap">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {current.line_items.map((line, i) => {
                  const rowClass = line.unmatched
                    ? "bg-destructive/10 border-l-2 border-l-destructive"
                    : line.sku_mismatch
                    ? "bg-amber-500/10 border-l-2 border-l-amber-500"
                    : line.price_changed
                    ? "bg-blue-500/10 border-l-2 border-l-blue-500"
                    : "";
                  return (
                    <tr key={i} className={`border-b border-border/50 ${rowClass}`}>
                      {/* # */}
                      <td className="px-1 py-1 text-muted-foreground font-medium align-top pt-2.5">{i + 1}</td>
                      {/* Internal SKU - read-only */}
                      <td className="px-1 py-1 align-top">
                        <Input
                          value={line.matched_sku}
                          readOnly
                          tabIndex={-1}
                          className="text-xs bg-muted/50 cursor-default font-mono h-8"
                          placeholder="—"
                        />
                      </td>
                      {/* Internal Product Name - read-only */}
                      <td className="px-1 py-1 align-top">
                        <div className="whitespace-normal break-words text-xs min-h-[32px] px-2 py-1.5 bg-muted/50 rounded-md border border-input text-foreground">
                          {line.matched_internal_name || <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      {/* External SKU - editable with autocomplete */}
                      <td className="px-1 py-1 align-top">
                        <div className="relative">
                          <ProductAutocomplete
                            value={line.item_code}
                            onChange={(v) => updateLine(i, "item_code", v)}
                            onSelect={(p) => selectProduct(i, p)}
                            products={supplierFilteredPM}
                            searchField="code"
                            placeholder="Code"
                            className={`text-xs h-8 ${line.sku_mismatch ? "border-amber-500" : ""}`}
                            currentSupplier={current?.supplier_name}
                          />
                          {line.sku_mismatch && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" title="SKU mismatch" />
                          )}
                        </div>
                      </td>
                      {/* External Name - editable with autocomplete */}
                      <td className="px-1 py-1 align-top">
                        <div className="relative">
                          <ProductAutocomplete
                            value={line.description}
                            onChange={(v) => updateLine(i, "description", v)}
                            onSelect={(p) => selectProduct(i, p)}
                            products={supplierFilteredPM}
                            searchField="name"
                            placeholder="Item name"
                            className="text-xs"
                            currentSupplier={current?.supplier_name}
                            multiline
                          />
                          {line.unmatched && (
                            <Badge className="absolute -top-2 -right-1 text-[8px] px-1 py-0 bg-destructive text-destructive-foreground">Unmatched</Badge>
                          )}
                        </div>
                      </td>
                      {/* Purchase UOM - read-only from PM */}
                      <td className="px-1 py-1 align-top">
                        <Input
                          value={line.matched_purchase_uom}
                          readOnly
                          tabIndex={-1}
                          className="text-xs bg-muted/50 cursor-default h-8"
                          placeholder="—"
                        />
                      </td>
                      {/* Purchase Qty - editable */}
                      <td className="px-1 py-1 align-top">
                        <Input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => updateLine(i, "quantity", e.target.value)}
                          className="text-xs h-8 w-full"
                        />
                      </td>
                      {/* Stock UOM - read-only from PM */}
                      <td className="px-1 py-1 align-top">
                        <Input
                          value={line.matched_stock_uom}
                          readOnly
                          tabIndex={-1}
                          className="text-xs bg-muted/50 cursor-default h-8"
                          placeholder="—"
                        />
                      </td>
                      {/* Stock Qty - auto-calculated: Purchase Qty × PM stock_qty */}
                      <td className="px-1 py-1 align-top">
                        <Input
                          value={line.matched_sku ? String(((parseFloat(line.quantity) || 0) * (line.matched_stock_qty_ratio || 1)).toFixed(2).replace(/\.00$/, "")) : "—"}
                          readOnly
                          tabIndex={-1}
                          className="text-xs bg-muted/50 cursor-default h-8 font-mono w-full"
                          placeholder="—"
                        />
                      </td>
                      {/* Purchase Cost - editable */}
                      <td className="px-1 py-1 align-top">
                        <div className="relative">
                          <Input
                            type="number"
                            value={line.unit_price}
                            onChange={(e) => updateLine(i, "unit_price", e.target.value)}
                            className={`text-xs h-8 w-full ${line.price_changed ? "border-blue-500" : ""}`}
                          />
                          {line.price_changed && line.pm_unit_price !== undefined && (
                            <span className="block text-[9px] text-blue-600 dark:text-blue-400 mt-0.5 whitespace-nowrap">
                              PM: ${line.pm_unit_price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Discount */}
                      <td className="px-1 py-1 align-top">
                        <Input
                          type="number"
                          value={line.discount}
                          onChange={(e) => updateLine(i, "discount", e.target.value)}
                          className="text-xs h-8 w-full"
                          placeholder="0"
                        />
                      </td>
                      {/* Total */}
                      <td className="px-1 py-1 align-top">
                        <Input
                          type="number"
                          value={line.total}
                          onChange={(e) => updateLine(i, "total", e.target.value)}
                          className="text-xs font-medium h-8 w-full"
                        />
                      </td>
                      {/* Delete */}
                      <td className="px-1 py-1 align-top">
                        {current.line_items.length > 1 && (
                          <Button size="icon" variant="ghost" onClick={() => removeLine(i)} className="h-8 w-8">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Add Line</Button>

          {/* Totals */}
          <div className="flex items-center justify-end gap-4 text-sm border-t pt-2 flex-wrap">
            <div>
              <span className="text-muted-foreground">Subtotal: </span>
              <span className="font-mono font-medium">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {taxTotal > 0 && (
              <div>
                <span className="text-muted-foreground">Tax: </span>
                <span className="font-mono font-medium">{taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Discount:</span>
              <Input
                type="number"
                value={current.invoice_discount}
                onChange={(e) => updateField("invoice_discount", e.target.value)}
                className="text-xs h-7 w-24 font-mono text-right"
                placeholder="0.00"
              />
            </div>
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className={`font-mono font-bold ${totalMismatch ? "text-amber-600" : ""}`}>
                {displayTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {isBeverageWorld && (
                <span className="text-xs text-muted-foreground ml-1">(rounded)</span>
              )}
            </div>
            {aiTotal !== undefined && (
              <div>
                <span className="text-xs text-muted-foreground">
                  Doc total: ${aiTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Save actions */}
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            {totalInvoices > 1 && !allSaved && (
              <Button onClick={handleSaveAll} disabled={saving || savingAll}>
                {savingAll ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                {savingAll ? `Saving... (${savedCount}/${totalInvoices})` : `Save All ${totalInvoices} Invoices`}
              </Button>
            )}

            {!current.saved ? (
              <Button variant={totalInvoices > 1 ? "secondary" : "default"} onClick={handleSaveCurrent} disabled={saving || savingAll || !!current.is_duplicate || hasUnmatchedItems}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                {current.is_duplicate ? "Duplicate — Cannot Save" : hasUnmatchedItems ? "Match All Items to Save" : saving ? "Saving..." : "Save This Invoice"}
              </Button>
            ) : (
              <Badge className="bg-green-100 text-green-800 border-green-300 py-1.5 px-3">✓ Saved</Badge>
            )}

            {current.invoice_status && (
              <Badge className={`${statusBadgeClass(current.invoice_status)} py-1 px-2.5`}>
                {current.invoice_status}
              </Badge>
            )}

            <Button variant="outline" onClick={() => { setInvoices([]); setCurrentIdx(0); setSavedCount(0); }}>Scan Another</Button>
          </div>

          {/* Invoice thumbnails for quick navigation */}
          {totalInvoices > 1 && (
            <div className="flex gap-2 flex-wrap pt-2 border-t">
              {invoices.map((inv, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIdx(idx)}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    idx === currentIdx ? "border-primary bg-primary/10 text-primary font-medium" : 
                    inv.saved ? "border-green-300 bg-green-50 text-green-700" :
                    inv.is_duplicate ? "border-destructive bg-destructive/10 text-destructive" :
                    "border-border hover:border-muted-foreground"
                  }`}
                >
                  {inv.invoice_number || `#${idx + 1}`}
                  {inv.saved && " ✓"}
                  {inv.is_duplicate && !inv.saved && " ⚠"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InvoiceScanner;
