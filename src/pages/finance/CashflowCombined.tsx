import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CashflowStatement from "./CashflowStatement";
import CashflowLedger from "./CashflowLedger";

export default function CashflowCombined() {
  const [view, setView] = useState<"statement" | "ledger">("statement");

  return (
    <div className="p-6 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-2">
        <Tabs value={view} onValueChange={(v) => setView(v as "statement" | "ledger")}>
          <TabsList>
            <TabsTrigger value="statement">Statement view</TabsTrigger>
            <TabsTrigger value="ledger">Ledger view</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="-mx-6 -mb-6">
        {view === "statement" ? <CashflowStatement /> : <CashflowLedger />}
      </div>
    </div>
  );
}
