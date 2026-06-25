/**
 * Shared Product Master resolver.
 *
 * Resolution priority:
 *  1. Exact External SKU match (authoritative when present)
 *  2. Exact External Name match (fallback when no SKU)
 *  3. product_master_id / internal_sku lookup (hydration only)
 *
 * The resolver always returns the supplier-specific entry so that
 * External Name comes from the correct `product_suppliers` row,
 * even when multiple entries share the same `product_master_id`.
 */

export interface PMEntry {
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

const norm = (v: string) =>
  v.toLowerCase().replace(/[\r\n\t]+/g, " ").replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").replace(/\b(limited|ltd|co|company)\b/g, " ").replace(/\s+/g, " ").trim();

const supplierMatch = (a?: string, b?: string) => {
  if (!a || !b) return false;
  const na = norm(a), nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
};

/**
 * Find the best PM entry for a line item.
 *
 * @param itemCode     - external SKU from the scanned/entered line
 * @param description  - product name from the scanned/entered line
 * @param productMasterId - previously linked product_master_id (for hydration)
 * @param supplierEntryId - previously linked supplier_entry_id
 * @param internalSku  - previously matched internal_sku
 * @param products     - the full flattened PM array
 * @param invoiceSupplier - the supplier name on the current invoice
 */
export function resolveProductMatch(
  {
    itemCode,
    description,
    productMasterId,
    supplierEntryId,
    internalSku,
  }: {
    itemCode?: string;
    description?: string;
    productMasterId?: string | null;
    supplierEntryId?: string;
    internalSku?: string;
  },
  products: PMEntry[],
  invoiceSupplier?: string,
): PMEntry | null {
  const code = (itemCode || "").trim().toLowerCase();
  const desc = (description || "").trim().toLowerCase();

  // === PRIORITY 1: Exact External SKU ===
  if (code) {
    if (invoiceSupplier) {
      const skuSupplierMatch = products.find(
        p => (p.external_sku || "").trim().toLowerCase() === code && supplierMatch(p.supplier, invoiceSupplier)
      );
      if (skuSupplierMatch) return skuSupplierMatch;
      const segSupplier = products.find(p => {
        const eSku = (p.external_sku || "").trim().toLowerCase();
        if (!eSku) return false;
        const segOk = eSku.split("|").some(seg => seg.trim() === code) || eSku.includes(code) || code.includes(eSku);
        return segOk && supplierMatch(p.supplier, invoiceSupplier);
      });
      if (segSupplier) return segSupplier;
      // Supplier known — do NOT fall through to a different-supplier SKU match.
    } else {
      const skuMatch = products.find(p => (p.external_sku || "").trim().toLowerCase() === code);
      if (skuMatch) return skuMatch;
      const segmentMatch = products.find(p => {
        const eSku = (p.external_sku || "").trim().toLowerCase();
        if (!eSku) return false;
        return eSku.split("|").some(seg => seg.trim() === code) || eSku.includes(code) || code.includes(eSku);
      });
      if (segmentMatch) return segmentMatch;
    }
  }

  // === PRIORITY 2: Exact External Name ===
  if (desc) {
    if (invoiceSupplier) {
      // Supplier-scoped exact
      const nameSupplierMatch = products.find(p => {
        const spn = (p.supplier_product_name || "").trim().toLowerCase();
        return spn && spn === desc && supplierMatch(p.supplier, invoiceSupplier);
      });
      if (nameSupplierMatch) return nameSupplierMatch;
      // Supplier-scoped fuzzy
      const fuzzySupplier = products.find(p => {
        const spn = (p.supplier_product_name || "").trim().toLowerCase();
        const ipn = (p.internal_product_name || "").trim().toLowerCase();
        const nameOk = (spn && (desc.includes(spn) || spn.includes(desc))) || (ipn && (desc.includes(ipn) || ipn.includes(desc)));
        return nameOk && supplierMatch(p.supplier, invoiceSupplier);
      });
      if (fuzzySupplier) return fuzzySupplier;
      // Supplier known — do NOT fall through to a different-supplier name match.
      // Fall through to PRIORITY 3 (ID hydration) which is also supplier-scoped.
    } else {
      const nameMatch = products.find(p => {
        const spn = (p.supplier_product_name || "").trim().toLowerCase();
        return spn && spn === desc;
      });
      if (nameMatch) return nameMatch;
      const fuzzy = products.find(p => {
        const spn = (p.supplier_product_name || "").trim().toLowerCase();
        const ipn = (p.internal_product_name || "").trim().toLowerCase();
        return (spn && (desc.includes(spn) || spn.includes(desc))) || (ipn && (desc.includes(ipn) || ipn.includes(desc)));
      });
      if (fuzzy) return fuzzy;
    }
  }

  // === PRIORITY 3: Hydration by stored IDs ===
  if (supplierEntryId) {
    const byEntryId = products.find(p => p.supplier_entry_id === supplierEntryId);
    if (byEntryId) {
      if (!invoiceSupplier || supplierMatch(byEntryId.supplier, invoiceSupplier)) return byEntryId;
      // Stored entry belongs to a different supplier than the current invoice.
      // Prefer a sibling row on the same product_master with the matching supplier.
      const supplierSibling = products.find(
        p => p.id === byEntryId.id && supplierMatch(p.supplier, invoiceSupplier)
      );
      if (supplierSibling) return supplierSibling;
      return byEntryId;
    }
  }
  if (productMasterId) {
    // When hydrating by product_master_id, still prefer the one matching the SKU or supplier
    if (code) {
      const byIdAndSku = products.find(p => p.id === productMasterId && (p.external_sku || "").trim().toLowerCase() === code);
      if (byIdAndSku) return byIdAndSku;
    }
    if (invoiceSupplier) {
      const byIdAndSupplier = products.find(p => p.id === productMasterId && supplierMatch(p.supplier, invoiceSupplier));
      if (byIdAndSupplier) return byIdAndSupplier;
      // When we know the invoice supplier, do NOT fall through to an un-scoped
      // product_master_id hit — that would return a different supplier's row.
    } else {
      const byId = products.find(p => p.id === productMasterId);
      if (byId) return byId;
    }
  }
  if (internalSku) {
    if (invoiceSupplier) {
      const byInternalAndSupplier = products.find(p => p.internal_sku === internalSku && supplierMatch(p.supplier, invoiceSupplier));
      if (byInternalAndSupplier) return byInternalAndSupplier;
      // When invoice supplier is known, do not return a different-supplier row.
    } else {
      const allForSku = products.filter(p => p.internal_sku === internalSku);
      if (allForSku.length === 1) return allForSku[0];
    }
  }


  return null;
}

/**
 * Exact-only match used at save time to re-link a manually typed line
 * back to the Product Master without any fuzzy / contains behavior.
 *
 * Priority:
 *  1. Exact External SKU match (supplier-scoped first, then global)
 *  2. Exact Supplier Product Name match (supplier-scoped first, then global)
 *  3. internal_sku hydration (supplier-scoped first)
 *
 * Returns null if no exact match — the line stays unlinked.
 */
export function resolveExactMatch(
  {
    itemCode,
    description,
    internalSku,
  }: {
    itemCode?: string;
    description?: string;
    internalSku?: string;
  },
  products: PMEntry[],
  invoiceSupplier?: string,
): PMEntry | null {
  const code = (itemCode || "").trim().toLowerCase();
  const desc = (description || "").trim().toLowerCase();

  if (code) {
    if (invoiceSupplier) {
      const m = products.find(
        p => (p.external_sku || "").trim().toLowerCase() === code && supplierMatch(p.supplier, invoiceSupplier)
      );
      if (m) return m;
    }
    const m = products.find(p => (p.external_sku || "").trim().toLowerCase() === code);
    if (m) return m;
  }

  if (desc) {
    if (invoiceSupplier) {
      const m = products.find(p => {
        const spn = (p.supplier_product_name || "").trim().toLowerCase();
        return spn && spn === desc && supplierMatch(p.supplier, invoiceSupplier);
      });
      if (m) return m;
    }
    const m = products.find(p => (p.supplier_product_name || "").trim().toLowerCase() === desc);
    if (m) return m;
  }

  if (internalSku) {
    if (invoiceSupplier) {
      const m = products.find(p => p.internal_sku === internalSku && supplierMatch(p.supplier, invoiceSupplier));
      if (m) return m;
      // supplier known — do not return a different-supplier row
    } else {
      const all = products.filter(p => p.internal_sku === internalSku);
      if (all.length === 1) return all[0];
    }
  }


  return null;
}
