export type PurchasingTab = { title: string; url: string; adminOnly?: boolean };

export const PURCHASE_ORDERS_URL = "/procurement/purchase-orders";

export const purchasingSectionPages: PurchasingTab[] = [
  { title: "Overview", url: "/procurement/dashboard" },
  { title: "Purchase Orders", url: PURCHASE_ORDERS_URL },
  { title: "Invoices", url: "/procurement/invoices" },
  { title: "Supplier Accounts", url: "/procurement/finance/suppliers" },
  { title: "Purchasing Analysis", url: "/procurement/purchase-analysis", adminOnly: true },
];

/** Supplier directory: listed under Settings → Master Data for admins; non-admins keep it in Purchasing. */
export const SUPPLIER_DIRECTORY_TAB: PurchasingTab = { title: "Suppliers & Vendors", url: "/procurement/suppliers" };
export const isSupplierDirectoryRoute = (pathname: string) => matchesPurchasingPath(pathname, SUPPLIER_DIRECTORY_TAB.url);

export const stockMenuSectionPages: PurchasingTab[] = [
  { title: "Stock", url: "/procurement/inventory" },
  { title: "Menu costs", url: "/procurement/menu-costing" },
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
    { title: "Purchase Register", url: "/procurement/line-items" },
    { title: "Credit & Debit Notes", url: "/procurement/credit-notes", adminOnly: true },
    { title: "Goods received", url: "/procurement/receiving" },
  ],
  [
    { title: "Purchase Analysis", url: "/procurement/purchase-analysis", adminOnly: true },
    { title: "Spend Summary", url: "/procurement/finance/spend" },
    { title: "Supplier Pricing", url: "/procurement/supplier-pricing", adminOnly: true },
  ],
  [
    { title: "On hand", url: "/procurement/inventory" },
    { title: "Counts", url: "/procurement/stock-counts" },
    { title: "Movements", url: "/procurement/movements", adminOnly: true },
  ],
  [
    { title: "Products & Consumables", url: "/procurement/products" },
    { title: "Categories & Units", url: "/procurement/categories" },
  ],
];

export function matchesPurchasingPath(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function purchasingTabsForPath(pathname: string) {
  if (stockMovementRedirect(pathname)) pathname = "/procurement/movements";
  return purchasingTabGroups.find(group => group.some(tab => matchesPurchasingPath(pathname, tab.url)));
}

export function stockMovementRedirect(pathname: string) {
  if (pathname === "/procurement/transfers") return "/procurement/movements?type=transfer";
  if (pathname === "/procurement/waste") return "/procurement/movements?type=waste";
  return undefined;
}

export function purchasingParentPath(pathname: string) {
  if (matchesPurchasingPath(pathname, "/procurement/finance/suppliers") || supplierAccountsRedirect(pathname)) return "/procurement/finance/suppliers";
  return purchasingTabsForPath(pathname)?.[0].url ?? pathname;
}

export function supplierAccountsRedirect(pathname: string) {
  if (pathname === "/procurement/finance/payables") return "/procurement/finance/suppliers?view=invoice";
  if (pathname === "/procurement/deposit-ledger") return "/procurement/finance/suppliers";
  return undefined;
}

export function isStockMenuRoute(pathname: string) {
  return ["inventory", "stock-counts", "movements", "transfers", "waste", "menu-costing", "products", "categories"]
    .some(path => matchesPurchasingPath(pathname, `/procurement/${path}`));
}

export function canOpenPurchasingTab(tab: PurchasingTab, access: {
  isAdmin: boolean; isPreviewActive: boolean; previewIsAdmin: boolean; canAccessInvoices: boolean;
}) {
  if (tab.adminOnly) return access.isAdmin && (!access.isPreviewActive || access.previewIsAdmin);
  return (access.isAdmin && !access.isPreviewActive) || access.canAccessInvoices;
}