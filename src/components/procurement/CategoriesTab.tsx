import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductCategoriesPanel from "@/components/procurement/ProductCategoriesPanel";
import AccountingMappingsPanel from "@/components/procurement/AccountingMappingsPanel";
import UomOptionsPanel from "@/components/procurement/UomOptionsPanel";

export default function CategoriesTab() {
  return (
    <Tabs defaultValue="products" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="products">Product Categories</TabsTrigger>
        <TabsTrigger value="accounting">Accounting Mappings</TabsTrigger>
        <TabsTrigger value="uom">Units of Measure</TabsTrigger>
      </TabsList>
      <TabsContent value="products"><ProductCategoriesPanel /></TabsContent>
      <TabsContent value="accounting"><AccountingMappingsPanel /></TabsContent>
      <TabsContent value="uom"><UomOptionsPanel /></TabsContent>
    </Tabs>
  );
}
