import React, { useState, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ProductMasterEntry {
  id: string;
  supplier_entry_id?: string;
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

const normalizeSupplierName = (value: string) =>
  value.toLowerCase().replace(/[\r\n\t]+/g, " ").replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\b(limited|ltd|co|company)\b/g, " ").replace(/\s+/g, " ").trim();

interface ProductAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (product: ProductMasterEntry) => void;
  products: ProductMasterEntry[];
  searchField: "code" | "name";
  placeholder?: string;
  className?: string;
  currentSupplier?: string;
  multiline?: boolean;
}

const ProductAutocomplete = ({
  value,
  onChange,
  onSelect,
  products,
  searchField,
  placeholder,
  className,
  currentSupplier,
  multiline = false,
}: ProductAutocompleteProps) => {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const justSelectedRef = useRef(false);

  const query = value.trim().toLowerCase();

  const isSupplierMatch = (supplier?: string, invoiceSupplier?: string) => {
    if (!supplier || !invoiceSupplier) return false;
    const normalizedSupplier = normalizeSupplierName(supplier);
    const normalizedInvoiceSupplier = normalizeSupplierName(invoiceSupplier);
    return (
      normalizedSupplier === normalizedInvoiceSupplier ||
      normalizedSupplier.includes(normalizedInvoiceSupplier) ||
      normalizedInvoiceSupplier.includes(normalizedSupplier)
    );
  };

  const resolveExactMatch = (rawValue: string) => {
    const normalizedValue = rawValue.trim().toLowerCase();
    if (!normalizedValue) return undefined;

    const exactMatches = products.filter((p) => {
      if (searchField === "code") {
        return p.external_sku.trim().toLowerCase() === normalizedValue;
      }
      return (p.supplier_product_name || p.internal_product_name || "").trim().toLowerCase() === normalizedValue;
    });

    if (exactMatches.length === 0) return undefined;

    const supplierMatches = currentSupplier
      ? exactMatches.filter((p) => isSupplierMatch(p.supplier, currentSupplier))
      : [];

    if (supplierMatches.length === 1) return supplierMatches[0];
    // For SKU searches, exact SKU match is unique per supplier entry — always resolve
    if (searchField === "code" && supplierMatches.length > 0) return supplierMatches[0];
    if (exactMatches.length === 1) return exactMatches[0];
    if (searchField === "code" && exactMatches.length > 0) return exactMatches[0];
    return undefined;
  };

  const suggestions = useMemo(() => {
    if (!query || query.length < 1) return [];
    const results = products
      .filter((p) => p.supplier_product_name || p.internal_product_name)
      .filter((p) => {
        if (searchField === "code") {
          return p.external_sku.trim() !== "" && p.external_sku.toLowerCase().includes(query);
        }
        const name = (p.supplier_product_name || p.internal_product_name || "").toLowerCase();
        return name.includes(query);
      });
    return results.slice(0, 8);
  }, [query, products, searchField]);

  useEffect(() => {
    setHighlightIdx(-1);
  }, [suggestions]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIdx] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIdx]);

  const handleSelect = (product: ProductMasterEntry) => {
    justSelectedRef.current = true;
    onSelect(product);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Auto-grow textarea height
  useLayoutEffect(() => {
    if (multiline && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = `${Math.max(32, el.scrollHeight)}px`;
    }
  }, [value, multiline]);

  const handleFocus = () => {
    if (query.length >= 1) setOpen(true);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropUp(rect.bottom > window.innerHeight - 400);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    const exactMatch = resolveExactMatch(e.currentTarget.value);
    if (exactMatch) {
      onSelect(exactMatch);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {multiline ? (
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 whitespace-normal break-words resize-none overflow-hidden",
            className
          )}
          autoComplete="off"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
        />
      )}
      {open && suggestions.length > 0 && (
        <div
          ref={listRef}
          className={cn(
            "absolute z-50 left-0 min-w-[360px] w-max max-w-[600px] max-h-96 overflow-y-auto rounded-md border border-border bg-popover shadow-md",
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {suggestions.map((p, idx) => (
            <button
              key={`${p.id}-${idx}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(p)}
              onMouseEnter={() => setHighlightIdx(idx)}
              className={cn(
                "w-full text-left px-2 py-1.5 text-xs cursor-pointer transition-colors whitespace-normal break-words",
                idx === highlightIdx
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              )}
            >
              {p.external_sku && (!currentSupplier || (p.supplier && normalizeSupplierName(p.supplier) === normalizeSupplierName(currentSupplier))) && (
                <>
                  <span className="font-mono font-medium text-primary">{p.external_sku}</span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                </>
              )}
              <span>{p.supplier_product_name || p.internal_product_name}</span>
              {p.supplier && (
                <span className="ml-1.5 text-[10px] text-muted-foreground/70">({p.supplier})</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductAutocomplete;
