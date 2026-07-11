import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CashflowStatement from "./CashflowStatement";
import CashflowLedger from "./CashflowLedger";

type View = "statement" | "ledger";

export default function CashflowCombined() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const view: View = raw === "ledger" ? "ledger" : "statement";

  const setView = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("view", v);
    setParams(next, { replace: true });
  };

  return (
    <div className="p-6 max-w-[1920px] mx-auto">
      <div className="flex items-center justify-between mb-2">
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="statement">Direct</TabsTrigger>
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
