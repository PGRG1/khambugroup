import React from "react";
import { FileSpreadsheet } from "lucide-react";

export default function ProcurementInvoicesTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <FileSpreadsheet className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-foreground">Invoices</h3>
        <p className="text-sm text-muted-foreground max-w-md mt-1">
          Invoice header records and original uploaded files will appear here. Each invoice will have its own internal reference ID, with OCR upload support coming next.
        </p>
      </div>
    </div>
  );
}
