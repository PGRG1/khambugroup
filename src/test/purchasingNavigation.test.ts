import { describe, expect, it } from "vitest";
import { canOpenPurchasingTab, isStockMenuRoute, purchasingParentPath, purchasingTabsForPath } from "@/utils/purchasingNavigation";

describe("Purchasing route families", () => {
  it("keeps Invoices highlighted for all invoice tabs", () => {
    for (const path of ["invoices", "documents", "line-items", "credit-notes"]) expect(purchasingParentPath(`/procurement/${path}`)).toBe("/procurement/invoices");
  });
  it("keeps Supplier Accounts highlighted on its detail, payables and deposit pages", () => {
    for (const path of ["finance/suppliers/123", "finance/payables", "deposit-ledger"]) expect(purchasingParentPath(`/procurement/${path}`)).toBe("/procurement/finance/suppliers");
  });
  it("keeps Inventory highlighted across stock tabs", () => {
    for (const path of ["inventory", "stock-counts", "transfers", "waste"]) expect(purchasingParentPath(`/procurement/${path}`)).toBe("/procurement/inventory");
  });
  it("keeps Items Master highlighted on Categories & Units", () => {
    expect(purchasingParentPath("/procurement/categories")).toBe("/procurement/products");
  });
  it("selects Stock & menu only for the five stock and menu route families", () => {
    for (const path of ["inventory", "stock-counts", "transfers", "waste", "menu-costing"]) expect(isStockMenuRoute(`/procurement/${path}`)).toBe(true);
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
});