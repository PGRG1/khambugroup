import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type FeeRate = {
  id: string;
  payment_method: string;
  locality: string;
  merchant_number: string | null;
  rate: number;
  rounding_dp: number;
  notes: string | null;
};

type Merchant = {
  merchant_number: string;
  display_name: string;
  venue: string | null;
  shared_venues: string[];
};

const PM_LABEL: Record<string, string> = {
  visa: "Visa",
  visa_foreign: "Visa Foreign Card",
  mastercard: "Mastercard",
  mastercard_foreign: "Mastercard Foreign Card",
  alipay: "Alipay",
  wechat: "WeChat Pay",
  union_pay: "China UnionPay",
  payme: "PayMe",
  amex: "American Express",
  jcb: "JCB",
};

const LOCALITY_LABEL: Record<string, string> = {
  domestic: "Domestic",
  foreign: "Foreign",
  any: "Any",
};

export function FeeRatesTab({ processor, merchants }: { processor: { id: string; name: string } | null; merchants: Merchant[] }) {
  const [rates, setRates] = useState<FeeRate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!processor) return;
    setLoading(true);
    supabase
      .from("payment_processor_fee_rates")
      .select("*")
      .eq("processor_id", processor.id)
      .order("payment_method")
      .then(({ data }) => {
        setRates((data || []) as FeeRate[]);
        setLoading(false);
      });
  }, [processor?.id]);

  const merchantLabel = (mn: string | null) => {
    if (!mn) return "All";
    const m = merchants.find((x) => x.merchant_number === mn);
    if (!m) return mn;
    if (m.shared_venues?.length) return m.shared_venues.join(" / ");
    return m.venue || m.display_name;
  };

  if (!processor) {
    return <Card className="card-glass p-6 text-sm text-muted-foreground">Select a processor to view fee rates.</Card>;
  }

  // Sort: by display name, then locality, then merchant scope
  const sorted = [...rates].sort((a, b) => {
    const la = PM_LABEL[a.payment_method] || a.payment_method;
    const lb = PM_LABEL[b.payment_method] || b.payment_method;
    if (la !== lb) return la.localeCompare(lb);
    if (a.locality !== b.locality) return a.locality.localeCompare(b.locality);
    return (a.merchant_number || "").localeCompare(b.merchant_number || "");
  });

  return (
    <Card className="card-glass p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium">Contracted fee rates — {processor.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            These rates are applied to every transaction during settlement parsing. Variances are flagged in the audit.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No fee rates configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <th className="py-2 pr-4 font-medium">Payment Method</th>
                <th className="py-2 pr-4 font-medium">Locality</th>
                <th className="py-2 pr-4 font-medium">Store / Terminal</th>
                <th className="py-2 pr-4 font-medium text-right">Fee Rate</th>
                <th className="py-2 pr-4 font-medium text-right">Rounding</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                  <td className="py-2.5 pr-4">{PM_LABEL[r.payment_method] || r.payment_method}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{LOCALITY_LABEL[r.locality] || r.locality}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{merchantLabel(r.merchant_number)}</td>
                  <td className="py-2.5 pr-4 text-right td-num">{(Number(r.rate) * 100).toFixed(2)}%</td>
                  <td className="py-2.5 pr-4 text-right td-num text-muted-foreground">{r.rounding_dp} decimals</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
