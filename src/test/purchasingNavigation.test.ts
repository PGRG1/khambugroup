import { describe, expect, it } from "vitest";
import { supplierAccountsRedirect, stockMovementRedirect, SUPPLIER_DIRECTORY_TAB, isSupplierDirectoryRoute, canOpenPurchasingTab, isStockMenuRoute, purchasingAnalysisPages, purchasingParentPath, purchasingSectionPages, purchasingSectionPagesForPath, purchasingTabsForPath, stockMenuSectionPages } from "@/utils/purchasingNavigation";

describe("Purchasing route families", () => {
  it("keeps Invoices highlighted for all invoice tabs", () => {
    for (const path of ["invoices", "line-items", "credit-notes", "receiving"]) expect(purchasingParentPath(`/procurement/${path}`)).toBe("/procurement/invoices");
  });
  it("keeps Supplier Accounts highlighted on its detail, payables and deposit pages", () => {
    for (const path of ["finance/suppliers/123", "finance/payables", "deposit-ledger"]) expect(purchasingParentPath(`/procurement/${path}`)).toBe("/procurement/finance/suppliers");
  });
  it("Supplier Accounts and its details have no Purchasing sub-tabs", () => {
    expect(purchasingTabsForPath('/procurement/finance/suppliers')).toBeUndefined();
    expect(purchasingTabsForPath('/procurement/finance/suppliers/123')).toBeUndefined();
  });
  it("redirects only buying-side payables and deposits", () => {
    expect(supplierAccountsRedirect('/procurement/finance/payables')).toBe('/procurement/finance/suppliers?view=invoice');
    expect(supplierAccountsRedirect('/procurement/deposit-ledger')).toBe('/procurement/finance/suppliers');
    expect(supplierAccountsRedirect('/finance/payables')).toBeUndefined();
  });
  it("keeps Inventory highlighted across stock tabs", () => {
    for (const path of ["inventory", "stock-counts", "movements", "transfers", "waste"]) expect(purchasingParentPath(`/procurement/${path}`)).toBe("/procurement/inventory");
  });
  it("keeps Products & Consumables highlighted on Categories & Units", () => {
    expect(purchasingParentPath("/procurement/categories")).toBe("/procurement/products");
  });
  it("selects Stock & menu for stock, menu and product route families", () => {
    for (const path of ["inventory", "stock-counts", "movements", "transfers", "waste", "menu-costing", "products", "categories"]) expect(isStockMenuRoute(`/procurement/${path}`)).toBe(true);
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
  it("hides Credit & Debit Notes and Movements from non-admins", () => {
    for (const path of ["credit-notes", "movements"]) {
      const tab = purchasingTabsForPath(`/procurement/${path}`)?.find(t => t.url === `/procurement/${path}`);
      expect(tab).toBeDefined();
      if (tab) expect(canOpenPurchasingTab(tab, access)).toBe(false);
    }
  });
  it("allows invoice users to find Counts while count writes and approval remain server-authorized", () => {
    const counts=purchasingTabsForPath('/procurement/stock-counts')?.find(t=>t.url==='/procurement/stock-counts');
    expect(counts).toBeDefined();
    if(!counts)throw new Error('Counts tab missing');
    expect(canOpenPurchasingTab(counts,access)).toBe(true);
    expect(canOpenPurchasingTab(counts,{...access,canAccessInvoices:false})).toBe(false);
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
  it("removes all Purchasing analysis tabs", () => {
    expect(purchasingAnalysisPages).toEqual([]);
    for(const path of ['purchase-analysis','finance/spend','supplier-pricing']) expect(purchasingTabsForPath(`/procurement/${path}`)).toBeUndefined();
  });
});

describe("Purchasing section destinations", () => {
  it("lists the four Purchasing links in the approved order", () => {
    expect(purchasingSectionPages.map(page => page.url)).toEqual([
      "/procurement/dashboard", "/procurement/purchase-orders", "/procurement/invoices",
      "/procurement/finance/suppliers",
    ]);
  });
  it("keeps the supplier directory route and its non-admin invoice access unchanged", () => {
    expect(SUPPLIER_DIRECTORY_TAB.url).toBe("/procurement/suppliers");
    expect(SUPPLIER_DIRECTORY_TAB.adminOnly).toBeUndefined();
    expect(isSupplierDirectoryRoute("/procurement/suppliers")).toBe(true);
    expect(isStockMenuRoute("/procurement/suppliers")).toBe(false);
    expect(canOpenPurchasingTab(SUPPLIER_DIRECTORY_TAB, { isAdmin: false, isPreviewActive: false, previewIsAdmin: false, canAccessInvoices: true })).toBe(true);
    expect(canOpenPurchasingTab(SUPPLIER_DIRECTORY_TAB, { isAdmin: true, isPreviewActive: true, previewIsAdmin: false, canAccessInvoices: false })).toBe(false);
  });
  it("has exactly Stock and Menu costs as section pages", () => {
    expect(stockMenuSectionPages).toEqual([{title:"Stock",url:"/procurement/inventory"},{title:"Menu costs",url:"/procurement/menu-costing"}]);
    expect(purchasingSectionPagesForPath("/procurement/categories")).toBe(stockMenuSectionPages);
    expect(purchasingSectionPagesForPath("/procurement/waste")).toBe(stockMenuSectionPages);
    expect(purchasingSectionPagesForPath("/procurement/finance/suppliers/123")).toBe(purchasingSectionPages);
  });
  it("keeps only On hand, Counts and Movements under Stock", () => {
    expect(purchasingTabsForPath("/procurement/inventory")?.map(t => t.url)).toEqual(["/procurement/inventory", "/procurement/stock-counts", "/procurement/movements"]);
  });
  it("redirects Transfers into the transfer-only movement filter", () => {
    expect(stockMovementRedirect("/procurement/transfers")).toBe("/procurement/movements?type=transfer");
  });
  it("redirects Waste into the waste-only movement filter", () => {
    expect(stockMovementRedirect("/procurement/waste")).toBe("/procurement/movements?type=waste");
  });
});