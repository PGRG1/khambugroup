import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Trash2, Save, X, Pencil } from "lucide-react";
import { toast } from "sonner";

type FeeRate = {
  id: string;
  processor_id?: string;
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

const PM_OPTIONS: { value: string; label: string }[] = [
  { value: "visa", label: "Visa" },
  { value: "visa_foreign", label: "Visa Foreign Card" },
  { value: "mastercard", label: "Mastercard" },
  { value: "mastercard_foreign", label: "Mastercard Foreign Card" },
  { value: "alipay", label: "Alipay" },
  { value: "wechat", label: "WeChat Pay" },
  { value: "union_pay", label: "China UnionPay" },
  { value: "payme", label: "PayMe" },
  { value: "amex", label: "American Express" },
  { value: "amex_foreign", label: "American Express Foreign" },
  { value: "jcb", label: "JCB" },
];
const PM_LABEL: Record<string, string> = Object.fromEntries(PM_OPTIONS.map((o) => [o.value, o.label]));

const LOCALITY_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "domestic", label: "Domestic" },
  { value: "foreign", label: "Foreign" },
];
const LOCALITY_LABEL: Record<string, string> = Object.fromEntries(LOCALITY_OPTIONS.map((o) => [o.value, o.label]));

const ALL_MERCHANTS = "__all__";

type Draft = {
  payment_method: string;
  locality: string;
  merchant_number: string; // "" means All
  rate_pct: string; // editable percent string
  rounding_dp: number;
};

const blankDraft: Draft = {
  payment_method: "visa",
  locality: "domestic",
  merchant_number: "",
  rate_pct: "1.50",
  rounding_dp: 2,
};

export function FeeRatesTab({ processor, merchants }: { processor: { id: string; name: string } | null; merchants: Merchant[] }) {
  const [rates, setRates] = useState<FeeRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!processor) return;
    setLoading(true);
    const { data } = await supabase
      .from("payment_processor_fee_rates")
      .select("*")
      .eq("processor_id", processor.id)
      .order("payment_method");
    setRates((data || []) as FeeRate[]);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    setEditingId(null);
    setAdding(false);
  }, [processor?.id]);

  // Build distinct merchant groupings: e.g. "Assembly · 12345" + "Caliente / Hanabi · 67890"
  const merchantGroups = (() => {
    const seen = new Set<string>();
    const out: { label: string; mn: string }[] = [];
    merchants.forEach((m) => {
      if (seen.has(m.merchant_number)) return;
      seen.add(m.merchant_number);
      const venueLabel = m.shared_venues?.length
        ? m.shared_venues.join(" / ")
        : (m.venue || m.display_name);
      out.push({ label: venueLabel, mn: m.merchant_number });
    });
    return out;
  })();

  const renderTerminalCell = (mn: string | null) => {
    if (!mn) {
      if (merchantGroups.length === 0) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-col gap-0.5 font-mono text-xs">
          {merchantGroups.map((g) => <span key={g.mn}>{g.mn}</span>)}
        </div>
      );
    }
    return <span className="font-mono text-xs">{mn}</span>;
  };

  const renderStoreCell = (mn: string | null) => {
    if (!mn) {
      if (merchantGroups.length === 0) return <span>All</span>;
      return (
        <div className="flex flex-col gap-0.5">
          {merchantGroups.map((g) => <span key={g.mn}>{g.label}</span>)}
        </div>
      );
    }
    const m = merchants.find((x) => x.merchant_number === mn);
    const label = m
      ? (m.shared_venues?.length ? m.shared_venues.join(" / ") : (m.venue || m.display_name))
      : mn;
    return <span>{label}</span>;
  };

  const startEdit = (r: FeeRate) => {
    setAdding(false);
    setEditingId(r.id);
    setDraft({
      payment_method: r.payment_method,
      locality: r.locality,
      merchant_number: r.merchant_number || "",
      rate_pct: (Number(r.rate) * 100).toFixed(2),
      rounding_dp: r.rounding_dp,
    });
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setDraft(blankDraft);
  };

  const cancel = () => {
    setEditingId(null);
    setAdding(false);
  };

  const save = async () => {
    if (!processor) return;
    const rateNum = parseFloat(draft.rate_pct);
    if (Number.isNaN(rateNum) || rateNum < 0) {
      toast.error("Rate must be a non-negative number");
      return;
    }
    setSaving(true);
    const payload = {
      processor_id: processor.id,
      payment_method: draft.payment_method,
      locality: draft.locality,
      merchant_number: draft.merchant_number || null,
      rate: rateNum / 100,
      rounding_dp: draft.rounding_dp,
    };
    const res = editingId
      ? await supabase.from("payment_processor_fee_rates").update(payload).eq("id", editingId)
      : await supabase.from("payment_processor_fee_rates").insert(payload);
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(editingId ? "Rate updated" : "Rate added");
    cancel();
    reload();
  };

  const remove = async (r: FeeRate) => {
    if (!confirm(`Delete ${PM_LABEL[r.payment_method] || r.payment_method} (${LOCALITY_LABEL[r.locality]}) rate?`)) return;
    const { error } = await supabase.from("payment_processor_fee_rates").delete().eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rate deleted");
    reload();
  };

  if (!processor) {
    return <Card className="card-glass p-6 text-sm text-muted-foreground">Select a processor to view fee rates.</Card>;
  }

  const sorted = [...rates].sort((a, b) => {
    const la = PM_LABEL[a.payment_method] || a.payment_method;
    const lb = PM_LABEL[b.payment_method] || b.payment_method;
    if (la !== lb) return la.localeCompare(lb);
    if (a.locality !== b.locality) return a.locality.localeCompare(b.locality);
    return (a.merchant_number || "").localeCompare(b.merchant_number || "");
  });

  const renderEditor = () => (
    <tr className="bg-muted/30 border-b border-border/40">
      <td className="py-2 pr-2">
        <Select value={draft.payment_method} onValueChange={(v) => setDraft({ ...draft, payment_method: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PM_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 pr-2">
        <Select value={draft.locality} onValueChange={(v) => setDraft({ ...draft, locality: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LOCALITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 pr-2">
        <Select
          value={draft.merchant_number || ALL_MERCHANTS}
          onValueChange={(v) => setDraft({ ...draft, merchant_number: v === ALL_MERCHANTS ? "" : v })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_MERCHANTS}>All</SelectItem>
            {merchants.map((m) => (
              <SelectItem key={m.merchant_number} value={m.merchant_number}>
                {m.shared_venues?.length ? m.shared_venues.join(" / ") : (m.venue || m.display_name)}
                <span className="text-muted-foreground ml-2 font-mono text-[10px]">{m.merchant_number}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="py-2 pr-2">
        <div className="flex items-center justify-end gap-1">
          <Input
            value={draft.rate_pct}
            onChange={(e) => setDraft({ ...draft, rate_pct: e.target.value })}
            className="h-8 w-20 text-right td-num text-xs"
            inputMode="decimal"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </td>
      <td className="py-2 pr-2">
        <Input
          type="number"
          min={0}
          max={6}
          value={draft.rounding_dp}
          onChange={(e) => setDraft({ ...draft, rounding_dp: parseInt(e.target.value) || 0 })}
          className="h-8 w-16 text-right td-num text-xs ml-auto"
        />
      </td>
      <td className="py-2 pr-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </td>
    </tr>
  );

  return (
    <Card className="card-glass p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h3 className="text-sm font-medium">Contracted fee rates — {processor.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            These rates are applied to every transaction during settlement parsing. Variances are flagged in the audit.
          </p>
        </div>
        <Button size="sm" onClick={startAdd} disabled={adding || !!editingId}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add rate
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <th className="py-2 pr-2 font-medium">Terminal</th>
                <th className="py-2 pr-2 font-medium">Store</th>
                <th className="py-2 pr-2 font-medium">Payment Method</th>
                <th className="py-2 pr-2 font-medium">Locality</th>
                <th className="py-2 pr-2 font-medium text-right">Fee Rate</th>
                <th className="py-2 pr-2 font-medium text-right">Rounding</th>
                <th className="py-2 pr-2 font-medium text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {adding && renderEditor()}
              {sorted.length === 0 && !adding ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No fee rates configured.</td></tr>
              ) : (
                sorted.map((r) => editingId === r.id ? (
                  <tr key={r.id} className="bg-muted/30 border-b border-border/40">
                    {renderEditor().props.children}
                  </tr>
                ) : (
                  <tr key={r.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20 group">
                    <td className="py-2.5 pr-2 align-top">{renderTerminalCell(r.merchant_number)}</td>
                    <td className="py-2.5 pr-2 text-muted-foreground align-top">{renderStoreCell(r.merchant_number)}</td>
                    <td className="py-2.5 pr-2 align-top">{PM_LABEL[r.payment_method] || r.payment_method}</td>
                    <td className="py-2.5 pr-2 text-muted-foreground align-top">{LOCALITY_LABEL[r.locality] || r.locality}</td>
                    <td className="py-2.5 pr-2 text-right td-num align-top">{(Number(r.rate) * 100).toFixed(2)}%</td>
                    <td className="py-2.5 pr-2 text-right td-num text-muted-foreground align-top">{r.rounding_dp} decimals</td>
                    <td className="py-2.5 pr-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(r)} disabled={!!editingId || adding}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(r)} disabled={!!editingId || adding}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
