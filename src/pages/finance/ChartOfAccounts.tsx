import { useMemo, useState } from "react";
import { useChartOfAccounts, ChartAccount, AccountType, ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_GROUP, defaultNormalSide } from "@/hooks/useChartOfAccounts";
import { useAccountMapping, RULE_TYPES } from "@/hooks/useAccountMapping";
import { useJournal } from "@/hooks/useJournal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Check, X, RefreshCw } from "lucide-react";

const TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "cogs", "opex", "other_income", "other_expense"];

export default function ChartOfAccountsPage() {
  const { items, loading, createAccount, updateAccount, deleteAccount } = useChartOfAccounts();
  const { rebuildFromOperations } = useJournal();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<ChartAccount>>({ account_type: "asset", normal_side: "debit" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ChartAccount>>({});

  const grouped = useMemo(() => {
    const m = new Map<AccountType, ChartAccount[]>();
    TYPE_ORDER.forEach((t) => m.set(t, []));
    items.forEach((a) => m.get(a.account_type)?.push(a));
    return m;
  }, [items]);

  const handleAdd = async () => {
    const created = await createAccount(draft);
    if (created) { setAdding(false); setDraft({ account_type: "asset", normal_side: "debit" }); }
  };

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The complete list of accounts used in your books. Edit codes, names, and how they appear on your statements.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={rebuildFromOperations}>
            <RefreshCw className="h-4 w-4 mr-1" /> Rebuild Ledger
          </Button>
        </div>
      </header>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="mapping">Account Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4 mt-4">
          <div className="flex justify-end">
            {!adding && <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" /> Add Account</Button>}
          </div>
          {adding && (
            <Card className="card-glass p-4 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              <div><label className="text-[11px] text-muted-foreground">Code</label><Input value={draft.code ?? ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="h-9" /></div>
              <div className="col-span-2"><label className="text-[11px] text-muted-foreground">Name</label><Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-9" /></div>
              <div>
                <label className="text-[11px] text-muted-foreground">Type</label>
                <Select value={draft.account_type} onValueChange={(v) => setDraft({ ...draft, account_type: v as AccountType, normal_side: defaultNormalSide(v as AccountType) })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_ORDER.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 mt-5">
                <Switch checked={!!draft.is_cash} onCheckedChange={(v) => setDraft({ ...draft, is_cash: v })} />
                <span className="text-xs">Cash account</span>
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={handleAdd}><Check className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}><X className="h-4 w-4" /></Button>
              </div>
            </Card>
          )}

          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <div className="space-y-4">
              {TYPE_ORDER.map((t) => {
                const list = grouped.get(t) || [];
                if (list.length === 0) return null;
                return (
                  <Card key={t} className="card-glass">
                    <div className="px-4 py-2 border-b border-border/40 flex justify-between text-xs font-semibold text-muted-foreground">
                      <span>{ACCOUNT_TYPE_LABEL[t]} <span className="text-muted-foreground/60">({list.length})</span></span>
                      <span>{ACCOUNT_TYPE_GROUP[t]}</span>
                    </div>
                    <ul className="divide-y divide-border/30">
                      {list.map((a) => {
                        const isEdit = editingId === a.id;
                        return (
                          <li key={a.id} className="px-4 py-2 flex items-center gap-3">
                            {isEdit ? (
                              <>
                                <Input value={editDraft.code ?? a.code} onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value })} className="h-8 w-24 font-mono text-sm" />
                                <Input value={editDraft.name ?? a.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className="h-8 flex-1 text-sm" />
                                <div className="flex items-center gap-1 text-xs"><Switch checked={editDraft.is_cash ?? a.is_cash} onCheckedChange={(v) => setEditDraft({ ...editDraft, is_cash: v })} /> Cash</div>
                                <div className="flex items-center gap-1 text-xs"><Switch checked={editDraft.is_active ?? a.is_active} onCheckedChange={(v) => setEditDraft({ ...editDraft, is_active: v })} /> Active</div>
                                <button className="p-1 text-primary" onClick={async () => { await updateAccount(a.id, editDraft); setEditingId(null); setEditDraft({}); }}><Check className="h-4 w-4" /></button>
                                <button className="p-1" onClick={() => { setEditingId(null); setEditDraft({}); }}><X className="h-4 w-4" /></button>
                              </>
                            ) : (
                              <>
                                <span className="font-mono text-xs w-16 text-muted-foreground">{a.code}</span>
                                <span className="flex-1 text-sm">{a.name}</span>
                                {a.is_cash && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700">CASH</span>}
                                {!a.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">INACTIVE</span>}
                                <span className="text-[10px] text-muted-foreground uppercase">{a.normal_side}</span>
                                <button className="p-1 text-muted-foreground hover:text-foreground" onClick={() => { setEditingId(a.id); setEditDraft({}); }}><Pencil className="h-3.5 w-3.5" /></button>
                                <button className="p-1 text-muted-foreground hover:text-destructive" onClick={() => deleteAccount(a.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mapping" className="mt-4">
          <AccountMappingPanel accounts={items} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountMappingPanel({ accounts }: { accounts: ChartAccount[] }) {
  const { items, loading, upsert, remove } = useAccountMapping();
  const [draft, setDraft] = useState({ rule_type: "sales_revenue", match_key: "", account_id: "" });

  const grouped = useMemo(() => {
    const m = new Map<string, typeof items>();
    items.forEach((r) => {
      const arr = m.get(r.rule_type) || [];
      arr.push(r);
      m.set(r.rule_type, arr);
    });
    return m;
  }, [items]);

  const ruleDef = RULE_TYPES.find((r) => r.value === draft.rule_type);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-3xl">
        These rules tell the system which Chart of Accounts entry to debit/credit when posting sales, invoices, payments, payroll, and manual lines. Defaults are seeded — adjust them to match your books.
      </p>
      <Card className="card-glass p-4 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-[11px] text-muted-foreground">Rule</label>
          <Select value={draft.rule_type} onValueChange={(v) => setDraft({ ...draft, rule_type: v, match_key: "" })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{RULE_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Match key {ruleDef?.needsKey ? "(required)" : "(optional)"}</label>
          {draft.rule_type === "sales_payment_method" ? (
            <Select value={draft.match_key} onValueChange={(v) => setDraft({ ...draft, match_key: v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select method…" /></SelectTrigger>
              <SelectContent>
                {[
                  { v: "visa", l: "Visa" },
                  { v: "mastercard", l: "Mastercard" },
                  { v: "amex", l: "Amex" },
                  { v: "union_pay", l: "UnionPay" },
                  { v: "jcb", l: "JCB" },
                  { v: "alipay", l: "Alipay" },
                  { v: "wechat", l: "WeChat" },
                  { v: "payme", l: "PayMe" },
                  { v: "cash", l: "Cash" },
                ].map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (draft.rule_type === "sales_revenue" || draft.rule_type === "service_charge" || draft.rule_type === "sales_discount") ? (
            <Select value={draft.match_key} onValueChange={(v) => setDraft({ ...draft, match_key: v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select venue…" /></SelectTrigger>
              <SelectContent>
                {["Assembly", "Caliente", "Hanabi", "Events"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input value={draft.match_key} onChange={(e) => setDraft({ ...draft, match_key: e.target.value })} className="h-9" placeholder={ruleDef?.needsKey ? "e.g. Assembly / cash / COGS - Wine" : ""} />
          )}
        </div>
        <div className="md:col-span-2">
          <label className="text-[11px] text-muted-foreground">Account</label>
          <Select value={draft.account_id} onValueChange={(v) => setDraft({ ...draft, account_id: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select account…" /></SelectTrigger>
            <SelectContent>
              {accounts.filter((a) => a.is_active).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={async () => {
          if (!draft.account_id) return;
          await upsert(draft);
          setDraft({ ...draft, match_key: "", account_id: "" });
        }}><Plus className="h-4 w-4 mr-1" /> Save Rule</Button>
      </Card>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="space-y-3">
          {RULE_TYPES.map((rt) => {
            const list = grouped.get(rt.value) || [];
            return (
              <Card key={rt.value} className="card-glass">
                <div className="px-4 py-2 border-b border-border/40 text-xs font-semibold text-muted-foreground">
                  {rt.label} <span className="text-muted-foreground/60">({list.length})</span>
                </div>
                <ul className="divide-y divide-border/30">
                  {list.length === 0 && <li className="px-4 py-2 text-xs text-muted-foreground italic">No rules</li>}
                  {list.map((r) => {
                    const acc = accounts.find((a) => a.id === r.account_id);
                    return (
                      <li key={r.id} className="px-4 py-2 flex items-center gap-3 text-sm">
                        <span className="font-mono text-xs text-muted-foreground w-32 truncate">{r.match_key || "(default)"}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="flex-1">{acc ? `${acc.code} — ${acc.name}` : "Missing account"}</span>
                        <button className="p-1 text-muted-foreground hover:text-destructive" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
