import React, { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
}: ProductAutocompleteProps) => {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const query = value.trim().toLowerCase();

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
    // Prioritize supplier matches (products array is already sorted supplier-first)
    // Just slice to limit
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

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query.length >= 1 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md"
        >
          {suggestions.map((p, idx) => (
            <button
              key={`${p.id}-${idx}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(p)}
              onMouseEnter={() => setHighlightIdx(idx)}
              className={cn(
                "w-full text-left px-2 py-1.5 text-xs cursor-pointer transition-colors",
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
