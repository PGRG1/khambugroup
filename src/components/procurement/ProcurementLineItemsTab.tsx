import React from "react";
import { FileText } from "lucide-react";

export default function ProcurementLineItemsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <FileText className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-foreground">Invoice Line Items</h3>
        <p className="text-sm text-muted-foreground max-w-md mt-1">
          Line-by-line extracted invoice data will appear here. Each line item links back to its parent invoice and can be mapped to a Product Master entry.
        </p>
      </div>
    </div>
  );
}
