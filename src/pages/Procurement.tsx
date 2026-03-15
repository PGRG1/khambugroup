import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, FileSpreadsheet, FileText, ClipboardList, UtensilsCrossed } from "lucide-react";
import ProductMasterTab from "@/components/procurement/ProductMasterTab";
import ProcurementInvoicesTab from "@/components/procurement/ProcurementInvoicesTab";
import ProcurementLineItemsTab from "@/components/procurement/ProcurementLineItemsTab";
import InventoryOnHandTab from "@/components/procurement/InventoryOnHandTab";
import MenuCostingTab from "@/components/procurement/MenuCostingTab";

export default function Procurement() {
  const [activeTab, setActiveTab] = useState("product-master");

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <h1 className="text-2xl font-bold font-display">
        <span className="text-gradient-gold">Procurement</span>
      </h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="product-master" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />Product Master
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" />Invoices
          </TabsTrigger>
          <TabsTrigger value="line-items" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />Invoice Line Items
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />Inventory
          </TabsTrigger>
        </TabsList>

        <TabsContent value="product-master"><ProductMasterTab /></TabsContent>
        <TabsContent value="invoices"><ProcurementInvoicesTab /></TabsContent>
        <TabsContent value="line-items"><ProcurementLineItemsTab /></TabsContent>
        <TabsContent value="inventory"><InventoryOnHandTab /></TabsContent>
      </Tabs>
    </div>
  );
}
