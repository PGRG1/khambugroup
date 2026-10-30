import { describe, expect, it } from "vitest";
import { SUPPLIER_DIRECTORY_TAB, isSupplierDirectoryRoute, canOpenPurchasingTab, isStockMenuRoute, purchasingAnalysisPages, purchasingParentPath, purchasingSectionPages, purchasingSectionPagesForPath, purchasingTabsForPath, stockMenuSectionPages } from "@/utils/purchasingNavigation";

describe("Purchasing route families", () => {
  it("keeps Invoices highlighted for all invoice tabs", () => {
    for (const path of ["invoices", "line-items", "credit-notes", "receiving"]) expect(purchasingParentPath(`/procurement/${path}`)).toBe("/procurement/invoices");
  });
  it("keeps Supplier Accounts highlighted on its detail, payables and deposit pages", () => {
    for (const path of ["finance/suppliers/123", "finance/payables", "deposit-ledger"]) expect(purchasingParentPath(`/procurement/${path}`)).toBe("/procurement/finance/suppliers");
  });
  it("keeps Inventory highlighted across stock tabs", () => {
    for (const path of ["inventory", "stock-counts", "transfers", "waste"]) expect(purchasingParentPath(`/procurement/${path}`)).toBe("/procurement/inventory");
  });
  it("keeps Products & Consumables highlighted on Categories & Units", () => {
    expect(purchasingParentPath("/procurement/categories")).toBe("/procurement/products");
  });
  it("selects Stock & menu for stock, menu and product route families", () => {
    for (const path of ["inventory", "stock-counts", "transfers", "waste", "menu-costing", "products", "categories"]) expect(isStockMenuRoute(`/procurement/${path}`)).toBe(true);
    for (const path of ["invoices", "suppliers", "dashboard", "inventory-other"]) expect(isStockMenuRoute(`/procurement/${path}`)).toBe(false);
  });
  it("does not add tabs to unrelated pages or similar prefixes", () => {
    expect(purchasingTabsForPath("/procurement/dashboard")).toBeUndefined();
    expect(purchasingTabsForPath("/procurement/invoices-other")).toBeUndefined();
  });
});

describe("Purchasing navigation access", () => {
  const standard = { title: "Invoices", url: "/procurement/invoices" };
  const admin = { ...standard, adminOnly: true };
  const access = { isAdmin: false, isPreviewActive: false, previewIsAdmin: false, canAccessInvoices: true };
  it("hides Credit & Debit Notes, Stock Counts, Transfers and Waste from non-admins", () => {
    for (const path of ["credit-notes", "stock-counts", "transfers", "waste"]) {
      const tab = purchasingTabsForPath(`/procurement/${path}`)?.find(t => t.url === `/procurement/${path}`);
      expect(tab).toBeDefined();
      if (tab) expect(canOpenPurchasingTab(tab, access)).toBe(false);
    }
  });
  it("hides admin destinations when an admin previews a non-admin", () => {
    expect(canOpenPurchasingTab(admin, { ...access, isAdmin: true, isPreviewActive: true })).toBe(false);
  });
  it("shows admin destinations when an admin previews an admin", () => {
    expect(canOpenPurchasingTab(admin, { ...access, isAdmin: true, isPreviewActive: true, previewIsAdmin: true })).toBe(true);
  });
  it("hides standard tabs when the effective user cannot open invoices", () => {
    expect(canOpenPurchasingTab(standard, { ...access, canAccessInvoices: false })).toBe(false);
    expect(canOpenPurchasingTab(standard, { ...access, isAdmin: true, isPreviewActive: true, canAccessInvoices: false })).toBe(false);
  });
  it("preserves the signed-in admin bypass outside preview", () => {
    expect(canOpenPurchasingTab(standard, { ...access, isAdmin: true, canAccessInvoices: false })).toBe(true);
  });
  it("shows Spend Summary to users with invoices access but not Purchase Analysis", () => {
    expect(purchasingAnalysisPages.filter(tab => canOpenPurchasingTab(tab, access)).map(tab => tab.url)).toEqual(["/procurement/finance/spend"]);
    expect(purchasingAnalysisPages.filter(tab => canOpenPurchasingTab(tab, { ...access, canAccessInvoices: false }))).toEqual([]);
  });
  it("keeps Supplier Pricing admin-only and reachable from the Purchasing Analysis tab row", () => {
    expect(purchasingSectionPages.some(tab => tab.url === "/procurement/supplier-pricing")).toBe(false);
    expect(purchasingParentPath("/procurement/supplier-pricing")).toBe("/procurement/purchase-analysis");
    const pricing = purchasingTabsForPath("/procurement/supplier-pricing")?.find(tab => tab.url === "/procurement/supplier-pricing");
    expect(pricing).toBeDefined();
    if (!pricing) return;
    expect(canOpenPurchasingTab(pricing, access)).toBe(false);
    expect(canOpenPurchasingTab(pricing, { ...access, isAdmin: true })).toBe(true);
    expect(canOpenPurchasingTab(pricing, { ...access, isAdmin: true, isPreviewActive: true })).toBe(false);
    expect(canOpenPurchasingTab(pricing, { ...access, isAdmin: true, isPreviewActive: true, previewIsAdmin: true })).toBe(true);
  });
  it("applies previewed page access to Spend Summary independently of admin-only analysis", () => {
    const preview = { ...access, isAdmin: true, isPreviewActive: true };
    expect(purchasingAnalysisPages.filter(tab => canOpenPurchasingTab(tab, preview)).map(tab => tab.url)).toEqual(["/procurement/finance/spend"]);
    expect(purchasingAnalysisPages.filter(tab => canOpenPurchasingTab(tab, { ...preview, canAccessInvoices: false }))).toEqual([]);
  });
});

describe("Purchasing section destinations", () => {
  it("lists the five Purchasing links in the approved order", () => {
    expect(purchasingSectionPages.map(page => page.url)).toEqual([
      "/procurement/dashboard", "/procurement/purchase-orders", "/procurement/invoices",
      "/procurement/finance/suppliers", "/procurement/purchase-analysis",
    ]);
  });
  it("keeps Purchasing Analysis admin-only while Spend Summary stays open to invoice users", () => {
    const access = { isAdmin: false, isPreviewActive: false, previewIsAdmin: false, canAccessInvoices: true };
    const analysis = purchasingSectionPages.find(p => p.url === "/procurement/purchase-analysis")!;
    expect(canOpenPurchasingTab(analysis, access)).toBe(false);
    expect(canOpenPurchasingTab(analysis, { ...access, isAdmin: true, isPreviewActive: true })).toBe(false);
    expect(canOpenPurchasingTab(analysis, { ...access, isAdmin: true })).toBe(true);
    const spend = purchasingTabsForPath("/procurement/finance/spend")!.find(t => t.url === "/procurement/finance/spend")!;
    expect(canOpenPurchasingTab(spend, access)).toBe(true);
  });
  it("keeps the supplier directory route and its non-admin invoice access unchanged", () => {
    expect(SUPPLIER_DIRECTORY_TAB.url).toBe("/procurement/suppliers");
    expect(SUPPLIER_DIRECTORY_TAB.adminOnly).toBeUndefined();
    expect(isSupplierDirectoryRoute("/procurement/suppliers")).toBe(true);
    expect(isStockMenuRoute("/procurement/suppliers")).toBe(false);
    expect(canOpenPurchasingTab(SUPPLIER_DIRECTORY_TAB, { isAdmin: false, isPreviewActive: false, previewIsAdmin: false, canAccessInvoices: true })).toBe(true);
    expect(canOpenPurchasingTab(SUPPLIER_DIRECTORY_TAB, { isAdmin: true, isPreviewActive: true, previewIsAdmin: false, canAccessInvoices: false })).toBe(false);
  });
  it("orders the Stock & menu links with Products & Consumables in the middle", () => {
    expect(stockMenuSectionPages.map(page => page.title)).toEqual(["Inventory", "Products & Consumables", "Recipes & Menu Costing"]);
    expect(purchasingSectionPagesForPath("/procurement/categories")).toBe(stockMenuSectionPages);
    expect(purchasingSectionPagesForPath("/procurement/waste")).toBe(stockMenuSectionPages);
    expect(purchasingSectionPagesForPath("/procurement/finance/suppliers/123")).toBe(purchasingSectionPages);
  });
});