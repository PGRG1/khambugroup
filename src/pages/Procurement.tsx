import React, { useState, useEffect, Suspense, lazy } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/expenses/shared";

const ProcurementDashboardTab = lazy(() => import("@/components/procurement/ProcurementDashboardTab"));
const SuppliersTab = lazy(() => import("@/components/procurement/SuppliersTab"));
const ProductMasterTab = lazy(() => import("@/components/procurement/ProductMasterTab"));
const CategoriesTab = lazy(() => import("@/components/procurement/CategoriesTab"));
const ProcurementInvoicesTab = lazy(() => import("@/components/procurement/ProcurementInvoicesTab"));
const PurchaseOrdersTab = lazy(() => import("@/components/procurement/PurchaseOrdersTab"));
const ReceivingTab = lazy(() => import("@/components/procurement/ReceivingTab"));
const ProcurementLineItemsTab = lazy(() => import("@/components/procurement/ProcurementLineItemsTab"));
const DepositLedgerTab = lazy(() => import("@/components/procurement/DepositLedgerTab"));
const InventoryOnHandTab = lazy(() => import("@/components/procurement/InventoryOnHandTab"));
const MenuCostingTab = lazy(() => import("@/components/procurement/MenuCostingTab"));
const DocumentsTab = lazy(() => import("@/components/procurement/DocumentsTab"));

const tabTitles: Record<string, string> = {
  dashboard: "Overview",
  suppliers: "Suppliers & Vendors",
  "product-master": "Items Master",
  categories: "Categories & Units",
  invoices: "Invoices",
  "purchase-orders": "Purchase Orders",
  receiving: "Goods Receipts / GRNs",
  "line-items": "Purchase Register",
  "deposit-ledger": "Deposit Ledger",
  inventory: "Stock on Hand",
  "menu-costing": "Recipes & Menu Costing",
  documents: "Documents",
};

interface ProcurementProps {
  defaultTab?: string;
}

function TabFallback() {
  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[92px] rounded-xl border border-border/60 bg-card/40 animate-pulse" />
        ))}
      </div>
      <div className="h-[260px] rounded-xl border border-border/60 bg-card/40 animate-pulse" />
      <div className="h-[260px] rounded-xl border border-border/60 bg-card/40 animate-pulse" />
    </div>
  );
}

export default function Procurement({ defaultTab = "dashboard" }: ProcurementProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <PageHeader title={tabTitles[activeTab] || "Procurement"} />


      <Tabs value={activeTab}>
        <Suspense fallback={<TabFallback />}>
          <TabsContent value="dashboard"><ProcurementDashboardTab /></TabsContent>
          <TabsContent value="suppliers"><SuppliersTab /></TabsContent>
          <TabsContent value="product-master"><ProductMasterTab /></TabsContent>
          <TabsContent value="categories"><CategoriesTab /></TabsContent>
          <TabsContent value="invoices"><ProcurementInvoicesTab /></TabsContent>
          <TabsContent value="purchase-orders"><PurchaseOrdersTab /></TabsContent>
          <TabsContent value="receiving"><ReceivingTab /></TabsContent>
          <TabsContent value="line-items"><ProcurementLineItemsTab /></TabsContent>
          <TabsContent value="deposit-ledger"><DepositLedgerTab /></TabsContent>
          <TabsContent value="inventory"><InventoryOnHandTab /></TabsContent>
          <TabsContent value="menu-costing"><MenuCostingTab /></TabsContent>
          <TabsContent value="documents"><DocumentsTab /></TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
