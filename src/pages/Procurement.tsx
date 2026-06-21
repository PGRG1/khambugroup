import React, { useState, useEffect } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import ProductMasterTab from "@/components/procurement/ProductMasterTab";
import CategoriesTab from "@/components/procurement/CategoriesTab";
import SuppliersTab from "@/components/procurement/SuppliersTab";
import ProcurementInvoicesTab from "@/components/procurement/ProcurementInvoicesTab";
import ProcurementLineItemsTab from "@/components/procurement/ProcurementLineItemsTab";
import InventoryOnHandTab from "@/components/procurement/InventoryOnHandTab";
import MenuCostingTab from "@/components/procurement/MenuCostingTab";
import ProcurementDashboardTab from "@/components/procurement/ProcurementDashboardTab";
import DocumentsTab from "@/components/procurement/DocumentsTab";
import PurchaseOrdersTab from "@/components/procurement/PurchaseOrdersTab";
import ReceivingTab from "@/components/procurement/ReceivingTab";

const tabTitles: Record<string, string> = {
  dashboard: "Overview",
  suppliers: "Suppliers & Vendors",
  "product-master": "Items Master",
  categories: "Categories",
  invoices: "Invoices",
  "purchase-orders": "Purchase Orders",
  receiving: "Receiving",
  "line-items": "Invoice Line Items",
  inventory: "Inventory",
  "menu-costing": "Menu Costing",
  documents: "Documents",
};

interface ProcurementProps {
  defaultTab?: string;
}

export default function Procurement({ defaultTab = "dashboard" }: ProcurementProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <h1 className="text-2xl font-bold font-display">
        <span className="text-gradient-gold">{tabTitles[activeTab] || "Procurement"}</span>
      </h1>

      <Tabs value={activeTab}>
        <TabsContent value="dashboard"><ProcurementDashboardTab /></TabsContent>
        <TabsContent value="suppliers"><SuppliersTab /></TabsContent>
        <TabsContent value="product-master"><ProductMasterTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="invoices"><ProcurementInvoicesTab /></TabsContent>
        <TabsContent value="purchase-orders"><PurchaseOrdersTab /></TabsContent>
        <TabsContent value="receiving"><ReceivingTab /></TabsContent>
        <TabsContent value="line-items"><ProcurementLineItemsTab /></TabsContent>
        <TabsContent value="inventory"><InventoryOnHandTab /></TabsContent>
        <TabsContent value="menu-costing"><MenuCostingTab /></TabsContent>
        <TabsContent value="documents"><DocumentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
