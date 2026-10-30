export type PurchasingTab = { title: string; url: string; adminOnly?: boolean };

export const PURCHASE_ORDERS_URL = "/procurement/purchase-orders";

export const purchasingSectionPages: PurchasingTab[] = [
  { title: "Overview", url: "/procurement/dashboard" },
  { title: "Purchase Orders", url: PURCHASE_ORDERS_URL },
  { title: "Invoices", url: "/procurement/invoices" },
  { title: "Supplier Accounts", url: "/procurement/finance/suppliers" },
  { title: "Suppliers & Vendors", url: "/procurement/suppliers" },
  { title: "Items Master", url: "/procurement/products" },
  { title: "Supplier Pricing", url: "/procurement/supplier-pricing", adminOnly: true },
];

export const stockMenuSectionPages: PurchasingTab[] = [
  { title: "Inventory", url: "/procurement/inventory" },
  { title: "Recipes & Menu Costing", url: "/procurement/menu-costing" },
];

export const purchasingAnalysisPages: PurchasingTab[] = [
  { title: "Purchase Analysis", url: "/procurement/purchase-analysis", adminOnly: true },
  { title: "Spend Summary", url: "/procurement/finance/spend" },
];

export function purchasingSectionPagesForPath(pathname: string) {
  return isStockMenuRoute(pathname) ? stockMenuSectionPages : purchasingSectionPages;
}

export const purchasingTabGroups: PurchasingTab[][] = [
  [
    { title: "Invoices", url: "/procurement/invoices" },
    { title: "Documents", url: "/procurement/documents" },
    { title: "Purchase Register", url: "/procurement/line-items" },
    { title: "Credit & Debit Notes", url: "/procurement/credit-notes", adminOnly: true },
    { title: "Goods received", url: "/procurement/receiving" },
  ],
  [
    { title: "Supplier Accounts", url: "/procurement/finance/suppliers" },
    { title: "Open Payables", url: "/procurement/finance/payables" },
    { title: "Deposit Ledger", url: "/procurement/deposit-ledger" },
  ],
  [
    { title: "Stock on Hand", url: "/procurement/inventory" },
    { title: "Stock Counts", url: "/procurement/stock-counts", adminOnly: true },
    { title: "Transfers", url: "/procurement/transfers", adminOnly: true },
    { title: "Waste & Adjustments", url: "/procurement/waste", adminOnly: true },
  ],
  [
    { title: "Items Master", url: "/procurement/products" },
    { title: "Categories & Units", url: "/procurement/categories" },
  ],
];

export const matchesPurchasingPath = (pathname: string, url: string) =>
  pathname === url || pathname.startsWith(`${url}/`);

export function purchasingTabsForPath(pathname: string) {
  return purchasingTabGroups.find(group => group.some(tab => matchesPurchasingPath(pathname, tab.url)));
}

export function purchasingParentPath(pathname: string) {
  return purchasingTabsForPath(pathname)?.[0].url ?? pathname;
}

export function isStockMenuRoute(pathname: string) {
  return ["inventory", "stock-counts", "transfers", "waste", "menu-costing"]
    .some(path => matchesPurchasingPath(pathname, `/procurement/${path}`));
}

export function canOpenPurchasingTab(tab: PurchasingTab, access: {
  isAdmin: boolean; isPreviewActive: boolean; previewIsAdmin: boolean; canAccessInvoices: boolean;
}) {
  if (tab.adminOnly) return access.isAdmin && (!access.isPreviewActive || access.previewIsAdmin);
  return (access.isAdmin && !access.isPreviewActive) || access.canAccessInvoices;
}