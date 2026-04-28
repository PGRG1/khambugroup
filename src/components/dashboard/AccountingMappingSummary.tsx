import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, ExternalLink, Settings2 } from "lucide-react";
import { useAccountMapping } from "@/hooks/useAccountMapping";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { Card } from "@/components/ui/card";

const VENUES = ["Assembly", "Caliente", "Hanabi", "Events"];
const PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "visa", label: "Visa" },
  { key: "mastercard", label: "Mastercard" },
  { key: "amex", label: "Amex" },
  { key: "union_pay", label: "UnionPay" },
  { key: "jcb", label: "JCB" },
  { key: "alipay", label: "Alipay" },
  { key: "wechat", label: "WeChat" },
  { key: "payme", label: "PayMe" },
];

export default function AccountingMappingSummary() {
  const { items: rules, loading: rulesLoading } = useAccountMapping();
  const { items: accounts, loading: accLoading } = useChartOfAccounts();
  const [open, setOpen] = useState(false);

  // Persist open/closed state per session
  useEffect(() => {
    const v = sessionStorage.getItem("acctMappingOpen");
    if (v === "1") setOpen(true);
  }, []);
  useEffect(() => {
    sessionStorage.setItem("acctMappingOpen", open ? "1" : "0");
  }, [open]);

  const accountById = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    accounts.forEach((a) => m.set(a.id, { code: a.code, name: a.name }));
    return m;
  }, [accounts]);

  const lookup = (rule_type: string, match_key: string) => {
    const r = rules.find((x) => x.rule_type === rule_type && x.match_key === match_key);
    if (!r) {
      // fallback to the global default (empty match_key)
      const g = rules.find((x) => x.rule_type === rule_type && x.match_key === "");
      return g ? accountById.get(g.account_id) : undefined;
    }
    return accountById.get(r.account_id);
  };

  const loading = rulesLoading || accLoading;

  return (
    <Card className="card-glass overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <Settings2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Accounting mapping</span>
          <span className="text-xs text-muted-foreground">— where each sales line lands in the books</span>
        </div>
        <Link
          to="/finance/chart-of-accounts"
          onClick={(e) => e.stopPropagation()}
          className="hidden sm:inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Manage mappings <ExternalLink className="h-3 w-3" />
        </Link>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/40 pt-4">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <>
              {/* Revenue side */}
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Revenue (credit) — per venue
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {VENUES.map((v) => {
                    const sales = lookup("sales_revenue", v);
                    const svc = lookup("service_charge", v);
                    const disc = lookup("sales_discount", v);
                    return (
                      <div key={v} className="rounded-md border border-border/50 bg-card/50 p-3">
                        <div className="text-xs font-semibold text-foreground mb-2">{v}</div>
                        <ul className="space-y-1 text-[11px]">
                          <Row label="Sales" acct={sales} />
                          <Row label="Service Charge" acct={svc} />
                          <Row label="Discount" acct={disc} />
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Payments side */}
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Payments (debit) — per method
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {PAYMENT_METHODS.map((m) => {
                    const acct = lookup("sales_payment_method", m.key);
                    return (
                      <div key={m.key} className="rounded-md border border-border/50 bg-card/50 p-2.5">
                        <div className="text-[11px] font-semibold text-foreground mb-1">{m.label}</div>
                        <div className="text-[10px] text-muted-foreground leading-tight">
                          {acct ? (
                            <>
                              <span className="font-mono">{acct.code}</span> {acct.name}
                            </>
                          ) : (
                            <span className="text-destructive">Unmapped</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground italic">
                Each sales record posts a balanced journal entry: debit each payment method's account, credit the venue's revenue & service charge, debit any discount. Edit mappings under Finance → Chart of Accounts → Account Mapping.
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Row({ label, acct }: { label: string; acct?: { code: string; name: string } }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-muted-foreground min-w-[78px]">{label}</span>
      <span className="flex-1 text-foreground/90 leading-tight">
        {acct ? (
          <>
            <span className="font-mono text-muted-foreground">{acct.code}</span> {acct.name}
          </>
        ) : (
          <span className="text-destructive">Unmapped</span>
        )}
      </span>
    </li>
  );
}
