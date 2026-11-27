import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUomOptions } from "@/hooks/useUomOptions";
import { parsePrintedSize, categoryPaths, type SetupCategory } from "@/utils/chatInvoiceSetup";
import { nextSku, nextSupplierCode, supplierPrefix } from "@/utils/codes";
import CategoryCascadeSelect from "@/components/procurement/CategoryCascadeSelect";
import UomSelect from "@/components/procurement/UomSelect";

// Bani chat: everything an invoice needs before it can be booked, set up right here, one step at a time:
// 1) a new supplier, 2) each item that isn't in the Items Master (link an existing item or add a new one, with its
// category, the three units and, the first time a category is used, its account). Nothing leaves the chat.

export type SetupEntry = {
  id: string; supplier_entry_id?: string; internal_sku: string; external_sku: string; internal_product_name: string;
  supplier_product_name: string; purchase_unit_cost?: number; supplier?: string; purchase_unit?: string; stock_uom?: string; stock_qty?: number;
};
export type SetupLine = { index: number; printed: string; code: string; unit: string; price: number };

type Props = {
  tenantId: string;
  supplierName: string;
  /** Set once the invoice's supplier is in Bani. */
  supplierId: string | null;
  canEdit: boolean;
  lines: SetupLine[];
  /** Every Items Master entry (all suppliers), to link an item that already exists. */
  entries: SetupEntry[];
  onSupplierCreated: (created: { id: string; name: string; [k: string]: unknown }) => Promise<void> | void;
  onLinked: (index: number, entry: SetupEntry) => void;
};

const TERMS = [["COD", "Cash on delivery"], ["Net 7", "7 days"], ["Net 14", "14 days"], ["Net 30", "30 days"], ["Net 60", "60 days"], ["Monthly", "Monthly"]] as const;
const HAIR = "#E2E6E3";
const AMBER = "#B45309";
const field = "h-9 w-full min-w-0 rounded-lg border border-[#DCE4E0] bg-white px-2.5 text-[13px]";
const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function ChatInvoiceSetup(p: Props) {
  const db = supabase as any;
  const { items: uoms } = useUomOptions();
  const [cats, setCats] = useState<SetupCategory[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string; account_type: string | null }[]>([]);
  const [rules, setRules] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [itemsDone, setItemsDone] = useState(0);
  const [terms, setTerms] = useState<string>("COD");
  const [supName, setSupName] = useState(p.supplierName);
  const [sup, setSup] = useState({ contact: "", phone: "", email: "", address: "", type: "procurement" });

  useEffect(() => {
    let live = true;
    void (async () => {
      const [c, m, a, r] = await Promise.all([
        db.from("product_categories").select("id,name,level,parent_id,master_id,is_active").eq("tenant_id", p.tenantId),
        db.from("category_master").select("id,default_group").eq("level", 1),
        db.from("chart_of_accounts").select("id,code,name,account_type,is_active").eq("tenant_id", p.tenantId).order("code"),
        db.from("account_mapping_rules").select("match_key,account_id").eq("tenant_id", p.tenantId).eq("rule_type", "procurement_category"),
      ]);
      if (!live) return;
      setCats(((c.data ?? []) as SetupCategory[]).filter(x => x.is_active !== false));
      setGroups(Object.fromEntries(((m.data ?? []) as { id: string; default_group: string | null }[]).map(x => [x.id, x.default_group ?? ""])));
      setAccounts(((a.data ?? []) as any[]).filter(x => x.is_active !== false));
      setRules(Object.fromEntries(((r.data ?? []) as { match_key: string; account_id: string }[]).map(x => [x.match_key, x.account_id])));
    })();
    return () => { live = false; };
  }, [p.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const paths = useMemo(() => categoryPaths(cats, groups), [cats, groups]);
  const unitsOf = (t: "purchase" | "stock" | "base") => uoms.filter(u => u.uom_type === t && u.is_active);
  const steps = (p.supplierId ? 0 : 1) + (p.lines.length ? 1 : 0);
  const line = p.lines[0];

  if (!p.canEdit) return <div className="space-y-1.5 text-[14px]">
    <p>Before this can be booked, an approver needs to add {!p.supplierId ? `${p.supplierName} and ` : ""}{p.lines.length} item{p.lines.length === 1 ? "" : "s"} to the Items Master.</p>
    <p className="text-[13px] text-muted-foreground">Ask someone with Approve on Purchasing or Finance to open this invoice in chat.</p>
  </div>;

  const head = (n: number, title: string) => <p className="text-[12px] text-muted-foreground">Step {n} of {steps} · {title}</p>;
  const ticks = done.length > 0 && <div className="space-y-1">{done.map(d => <p key={d} className="flex items-center gap-1.5 text-[13px] text-[#2F7A5E]"><Check className="h-3.5 w-3.5" strokeWidth={3} />{d}</p>)}</div>;
  const err = error && <p className="text-[13px]" style={{ color: AMBER }}>{error}</p>;
  const card = "w-full max-w-[640px] rounded-2xl border bg-white p-4";

  // Step 1: the supplier.
  if (!p.supplierId) {
    const add = async () => {
      const name = supName.trim();
      if (!name) { setError("Enter the supplier's name"); return; }
      setBusy(true); setError("");
      const { data: same } = await db.from("suppliers").select("*").eq("tenant_id", p.tenantId).ilike("name", name).limit(1);
      const code = same?.[0] ? null : await nextSupplierCode(p.tenantId, name);
      const row = same?.[0] ?? (await db.from("suppliers").insert({ tenant_id: p.tenantId, name, code, vendor_type: sup.type, payment_terms: terms, contact_person: sup.contact.trim() || null, phone: sup.phone.trim() || null, email: sup.email.trim() || null, address: sup.address.trim() || null, is_active: true, invoice_rounding_mode: "sum_then_round", categories: [], delivery_days: [], moq: 0 }).select("*").single()).data;
      if (!row) { setBusy(false); setError("Couldn't add the supplier. Try again."); return; }
      setDone(d => [...d, `${row.name}${row.code ? ` (${row.code})` : ""} added`]);
      await p.onSupplierCreated(row);
      setBusy(false);
    };
    return <div className="space-y-2.5">
      <p className="text-[14px]">Before I can book it, there {steps === 1 ? "is 1 thing" : `are ${steps} things`} to set up. I'll go one at a time.</p>
      {head(1, "Supplier")}
      <p className="text-[14px]"><b className="font-medium">{p.supplierName}</b> is new. Add it?</p>
      <div className={card} style={{ borderColor: HAIR }}>
        <div className="grid gap-3" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
          <label className="flex min-w-0 flex-col gap-1"><span className="text-[11px] text-muted-foreground">Name</span><input className={field} value={supName} onChange={e => setSupName(e.target.value)} /></label>
          <label className="flex min-w-0 flex-col gap-1"><span className="text-[11px] text-muted-foreground">Payment terms</span>
            <select className={field} value={terms} onChange={e => setTerms(e.target.value)}>{TERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="flex min-w-0 flex-col gap-1"><span className="text-[11px] text-muted-foreground">Contact</span><input className={field} placeholder="Who you deal with" value={sup.contact} onChange={e => setSup({ ...sup, contact: e.target.value })} /></label>
          <label className="flex min-w-0 flex-col gap-1"><span className="text-[11px] text-muted-foreground">Phone</span><input className={field} inputMode="tel" value={sup.phone} onChange={e => setSup({ ...sup, phone: e.target.value })} /></label>
          <label className="flex min-w-0 flex-col gap-1"><span className="text-[11px] text-muted-foreground">Email</span><input className={field} inputMode="email" value={sup.email} onChange={e => setSup({ ...sup, email: e.target.value })} /></label>
          <label className="flex min-w-0 flex-col gap-1"><span className="text-[11px] text-muted-foreground">Type</span>
            <select className={field} value={sup.type} onChange={e => setSup({ ...sup, type: e.target.value })}><option value="procurement">Supplier</option><option value="expense">Vendor</option></select></label>
          <label className="col-span-2 flex min-w-0 flex-col gap-1"><span className="text-[11px] text-muted-foreground">Address</span><input className={field} value={sup.address} onChange={e => setSup({ ...sup, address: e.target.value })} /></label>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">Code {supplierPrefix(supName || p.supplierName)}-… is given automatically.</p>
        <div className="mt-3 flex justify-end"><button type="button" disabled={busy} className="h-9 rounded-full bg-[#1F6B5E] px-4 text-[13px] font-medium text-white disabled:opacity-50" onClick={() => void add()}>{busy ? "Adding…" : "Add supplier"}</button></div>
      </div>
      {err}
    </div>;
  }

  if (!line) return <>{ticks}</>;
  return <div className="space-y-2.5">
    {ticks}
    <p className="text-[12px] text-muted-foreground">New item · {itemsDone + 1} of {itemsDone + p.lines.length}</p>
    <ItemStep key={line.index} {...p} line={line} paths={paths} rules={rules} accounts={accounts} unitsOf={unitsOf} busy={busy} setBusy={setBusy} setError={setError}
      onRule={(k, a) => setRules(r => ({ ...r, [k]: a }))} onDone={t => { setItemsDone(n => n + 1); setDone(d => [...d, t]); }} />
    {err}
  </div>;
}

function ItemStep(p: Props & {
  line: SetupLine; paths: ReturnType<typeof categoryPaths>; rules: Record<string, string>; accounts: { id: string; code: string; name: string; account_type: string | null }[];
  unitsOf: (t: "purchase" | "stock" | "base") => { code: string; label: string }[]; busy: boolean; setBusy: (b: boolean) => void; setError: (e: string) => void;
  onRule: (key: string, account: string) => void; onDone: (text: string) => void;
}) {
  const db = supabase as any;
  const size = parsePrintedSize(p.line.printed);
  const existing = useMemo(() => {
    const seen = new Set<string>();
    const own = norm(p.supplierName);
    return [...p.entries].sort((a, b) => Number(norm(b.supplier) === own) - Number(norm(a.supplier) === own) || a.internal_product_name.localeCompare(b.internal_product_name))
      .filter(e => !seen.has(e.id) && seen.add(e.id));
  }, [p.entries, p.supplierName]);
  const purchaseCodes = p.unitsOf("purchase").map(u => u.code);
  // Same fields as Master data › Products › Add, filled from the invoice.
  const [f, setF] = useState({
    sku: "", external: cleanCode(p.line.code), name: p.line.printed.replace(/_r$/i, "").replace(/\s*[x×*]\s*\d+\s*$/i, "").trim(), theirs: p.line.printed,
    l1: "", l2: "", l3: "", stock: true,
    purchase: purchaseCodes.find(c => norm(c) === norm(p.line.unit)) ?? (size && size.pack > 1 ? (purchaseCodes.find(c => c === "Case") ?? "") : size?.unit === "ml" && purchaseCodes.includes("Bot") ? "Bot" : ""),
    cost: String(p.line.price || ""), stockUom: "", stockQty: String(size?.pack ?? 1),
    recipe: size?.unit ?? "", recipeQty: size ? String(Math.round(size.qty * size.pack * 1000) / 1000) : "1",
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF(x => ({ ...x, [k]: v }));
  const [mode, setMode] = useState<"new" | "link">("new");
  const [linkId, setLinkId] = useState("");
  const [account, setAccount] = useState("");
  const autoSku = useRef("");
  const group = p.paths.find(x => x.l1 === f.l1)?.group ?? "";
  const ruleKey = `${group}__${f.l1}`;
  const needsAccount = !!f.l1 && !!group && !p.rules[ruleKey];
  const accountChoices = group === "COGS" ? p.accounts.filter(a => /cogs|cost/i.test(`${a.account_type} ${a.name}`)) : group === "OpEx" ? p.accounts.filter(a => /opex|expense/i.test(`${a.account_type}`)) : p.accounts;
  useEffect(() => { if (needsAccount && !account) { const g = accountChoices.find(a => a.name.toLowerCase().includes(f.l1.toLowerCase().replace(/s$/, ""))); if (g) setAccount(g.id); } }, [needsAccount, f.l1]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!f.l1 || (f.sku && f.sku !== autoSku.current)) return;
    let live = true;
    void nextSku(p.tenantId, f.l1).then(next => { if (live) { autoSku.current = next; setF(x => ({ ...x, sku: next })); } });
    return () => { live = false; };
  }, [f.l1]); // eslint-disable-line react-hooks/exhaustive-deps
  const cost = Number(f.cost) || 0;
  const stockQ = f.stock ? Number(f.stockQty) || 0 : 1;
  const stockUom = f.stock ? f.stockUom : f.purchase;
  const money = (n: number, d = 2) => `HK$${n.toLocaleString("en-HK", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  const lbl = (t: string, el: ReactNode, wide = false) => <label className={`flex min-w-0 flex-col gap-1 ${wide ? "col-span-2" : ""}`}><span className="text-[12px] text-muted-foreground">{t}</span>{el}</label>;
  const sec = (t: string) => <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{t}</p>;
  const note = (t: string) => <p className="mt-2 rounded-lg bg-muted/30 p-2 text-[12px] text-muted-foreground">{t}</p>;

  const link = async () => {
    const e = existing.find(x => x.id === linkId);
    if (!e) { p.setError("Pick the item"); return; }
    p.setBusy(true); p.setError("");
    let entry: SetupEntry = e;
    if (!(e.supplier_entry_id && norm(e.supplier) === norm(p.supplierName))) {
      const { data: pm } = await db.from("product_master").select("purchase_unit,stock_uom,stock_qty,base_unit_type,base_unit_qty").eq("id", e.id).single();
      const { data, error } = await db.from("product_suppliers").insert({ tenant_id: p.tenantId, product_master_id: e.id, supplier: p.supplierName, external_sku: cleanCode(p.line.code), supplier_product_name: p.line.printed, purchase_unit: pm?.purchase_unit ?? e.purchase_unit ?? "", purchase_unit_cost: p.line.price, stock_uom: pm?.stock_uom ?? "", stock_qty: pm?.stock_qty ?? 1, base_unit_type: pm?.base_unit_type ?? "", base_unit_qty: pm?.base_unit_qty ?? 1, status: "Active" }).select("id").single();
      if (error || !data) { p.setBusy(false); p.setError(error?.message ?? "Couldn't link the item"); return; }
      entry = { ...e, supplier_entry_id: data.id, supplier: p.supplierName, supplier_product_name: p.line.printed, external_sku: cleanCode(p.line.code), purchase_unit_cost: p.line.price, purchase_unit: pm?.purchase_unit ?? e.purchase_unit, stock_uom: pm?.stock_uom ?? e.stock_uom, stock_qty: pm?.stock_qty ?? e.stock_qty };
    }
    p.onLinked(p.line.index, entry);
    p.onDone(`Linked to ${e.internal_product_name}`);
    p.setBusy(false);
  };

  const add = async () => {
    const miss = !f.sku.trim() ? "Internal SKU" : !f.name.trim() ? "Internal Product Name" : !f.l1 ? "Category" : !group ? `a group for ${f.l1}` : !f.purchase ? "Purchase UOM" : !(cost > 0) ? "Purchase Cost"
      : f.stock && (!f.stockUom || !(stockQ > 0)) ? "Stock UOM and Qty" : !f.recipe || !(Number(f.recipeQty) > 0) ? "Recipe UOM and Qty" : needsAccount && !account ? `the account for ${f.l1}` : "";
    if (miss) return p.setError(`Add ${miss}`);
    p.setBusy(true); p.setError("");
    const { data: taken } = await db.from("product_master").select("id").eq("tenant_id", p.tenantId).eq("internal_sku", f.sku.trim()).limit(1);
    if (taken?.length) { p.setBusy(false); p.setError(`${f.sku.trim()} is already used`); return; }
    if (needsAccount) {
      const { error } = await db.rpc("save_purchasing_setup", { p_tenant: p.tenantId, p_rows: [{ treatment: group, category: f.l1, new_treatment: null, account_id: account, venue_accounts: {} }], p_note: `Set from a chat invoice (${p.supplierName})` });
      if (error) { p.setBusy(false); p.setError(error.message); return; }
      p.onRule(ruleKey, account);
    }
    const units = { purchase_unit: f.purchase, purchase_unit_cost: cost, stock_uom: stockUom, stock_qty: stockQ, base_unit_type: f.recipe, base_unit_qty: Number(f.recipeQty) };
    const { data: pm, error: e1 } = await db.from("product_master").insert({
      tenant_id: p.tenantId, internal_sku: f.sku.trim(), internal_product_name: f.name.trim(), supplier_product_name: f.theirs.trim(), external_sku: f.external.trim(),
      level1_category: f.l1, level2_category: f.l2, level3_category: f.l3, financial_treatment: group, default_coa_account_id: null, supplier: p.supplierName, status: "Active",
      unit: stockUom, unit_cost: cost / stockQ, ...units, cost_per_stock_unit: cost / stockQ, cost_per_base_unit: cost / Number(f.recipeQty),
      creates_stock_movement: f.stock, purchase_yield: 100, cooking_yield: 100,
    }).select("id").single();
    if (e1 || !pm) { p.setBusy(false); p.setError(e1?.message ?? "Couldn't add the item"); return; }
    const { data: ps, error: e2 } = await db.from("product_suppliers").insert({ tenant_id: p.tenantId, product_master_id: pm.id, supplier: p.supplierName, external_sku: f.external.trim(), supplier_product_name: f.theirs.trim(), ...units, status: "Active" }).select("id").single();
    if (e2 || !ps) { p.setBusy(false); p.setError(e2?.message ?? "Couldn't add the supplier entry"); return; }
    p.onLinked(p.line.index, { id: pm.id, supplier_entry_id: ps.id, internal_sku: f.sku.trim(), external_sku: f.external.trim(), internal_product_name: f.name.trim(), supplier_product_name: f.theirs.trim(), purchase_unit_cost: cost, supplier: p.supplierName, purchase_unit: f.purchase, stock_uom: stockUom, stock_qty: stockQ });
    p.onDone(`${f.sku.trim()} ${f.name.trim()} added`);
    p.setBusy(false);
  };

  const btn = "inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1F6B5E] px-4 text-[13px] font-medium text-white disabled:opacity-50";
  return <>
    <p className="text-[14px]"><b className="font-medium">{p.line.printed}</b> · {money(p.line.price)}</p>
    <div className="w-full max-w-[640px] rounded-2xl border bg-white p-4" style={{ borderColor: HAIR }}>
      <div className="mb-3 flex gap-4 text-[13px]">
        {(["new", "link"] as const).map(m => <button key={m} type="button" className={mode === m ? "font-medium text-foreground underline underline-offset-4" : "text-muted-foreground"} onClick={() => setMode(m)}>{m === "new" ? "New item" : "Already in the Items Master"}</button>)}
      </div>
      {mode === "link" ? <div className="space-y-3">
        {lbl("Item", <select className={field} value={linkId} onChange={e => setLinkId(e.target.value)}><option value="">Pick the item</option>{existing.map(e => <option key={e.id} value={e.id}>{e.internal_sku} · {e.internal_product_name}</option>)}</select>)}
        <div className="flex justify-end"><button type="button" disabled={p.busy} className={btn} onClick={() => void link()}>{p.busy ? "Linking…" : "Link item"}</button></div>
      </div> : <div>
        {sec("Item")}
        <div className="grid grid-cols-2 gap-3">
          {lbl("Internal SKU *", <input className={`${field} font-mono`} value={f.sku} placeholder="Pick the category" onChange={e => set("sku", e.target.value)} />)}
          {lbl("External SKU", <input className={`${field} font-mono`} value={f.external} onChange={e => set("external", e.target.value)} />)}
          {lbl("Internal Product Name *", <input className={field} value={f.name} onChange={e => set("name", e.target.value)} />, true)}
          {lbl("Supplier Product Name", <input className={field} value={f.theirs} onChange={e => set("theirs", e.target.value)} />, true)}
        </div>
        <div className="mt-3"><span className="text-[12px] text-muted-foreground">Categories (L1 → L2 → L3)</span>
          <div className="mt-1"><CategoryCascadeSelect level1={f.l1} level2={f.l2} level3={f.l3} showLabels={false} onChange={v => setF(x => ({ ...x, l1: v.level1, l2: v.level2, l3: v.level3 }))} /></div></div>
        {sec(`Supplier · ${p.supplierName}`)}
        <div className="grid grid-cols-2 gap-3">
          {lbl("Purchase UOM", <UomSelect allowCreate type="purchase" value={f.purchase} onChange={v => set("purchase", v)} placeholder="e.g. Case" />)}
          {lbl("Purchase Cost (HK$)", <input className={field} inputMode="decimal" value={f.cost} onChange={e => set("cost", e.target.value)} />)}
          {f.stock && lbl("Stock UOM", <UomSelect allowCreate type="stock" value={f.stockUom} onChange={v => set("stockUom", v)} placeholder="e.g. Tin" />)}
          {f.stock && lbl("Stock Qty", <input className={field} inputMode="decimal" value={f.stockQty} onChange={e => set("stockQty", e.target.value)} />)}
        </div>
        {f.stock && stockQ > 0 && note(`Cost per Stock Unit: ${money(cost / stockQ)}`)}
        {sec("Recipe Units")}
        <div className="grid grid-cols-2 gap-3">
          {lbl("Recipe UOM", <UomSelect allowCreate type="base" value={f.recipe} onChange={v => set("recipe", v)} placeholder="e.g. g, ml" />)}
          {lbl("Recipe Qty", <input className={field} inputMode="decimal" value={f.recipeQty} onChange={e => set("recipeQty", e.target.value)} />)}
        </div>
        {Number(f.recipeQty) > 0 && note(`Standard Cost per Recipe Unit: ${money(cost / Number(f.recipeQty), 4)}`)}
        {needsAccount && <>{sec("Books")}{lbl(`Account for ${f.l1}`, <select className={field} value={account} onChange={e => setAccount(e.target.value)}><option value="">Pick the account</option>{accountChoices.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>)}</>}
        <div className="mt-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={f.stock} onChange={e => set("stock", e.target.checked)} />Counts as stock</label>
          <button type="button" disabled={p.busy} className={btn} onClick={() => void add()}>{p.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{p.busy ? "Adding…" : "Add item"}</button>
        </div>
      </div>}
    </div>
  </>;
}

/** A supplier code is never a decimal: "44230.1" read off a photo is kept as "44230". */
function cleanCode(code: string): string {
  const c = (code ?? "").trim();
  return /^\d+\.\d+$/.test(c) ? c.split(".")[0] : c;
}
