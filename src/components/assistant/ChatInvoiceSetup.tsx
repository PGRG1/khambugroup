import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUomOptions } from "@/hooks/useUomOptions";
import { parsePrintedSize, categoryPaths, type SetupCategory } from "@/utils/chatInvoiceSetup";
import { nextSku, nextSupplierCode, supplierPrefix } from "@/utils/codes";

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
    {head(steps, `Items (${done.filter(d => d.endsWith("added to the Items Master") || d.startsWith("Linked")).length + 1} of ${done.filter(d => d.endsWith("added to the Items Master") || d.startsWith("Linked")).length + p.lines.length})`)}
    <ItemStep key={line.index} {...p} line={line} paths={paths} rules={rules} accounts={accounts} unitsOf={unitsOf} busy={busy} setBusy={setBusy} setError={setError}
      onRule={(k, a) => setRules(r => ({ ...r, [k]: a }))} onDone={t => setDone(d => [...d, t])} />
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
  const [mode, setMode] = useState<"new" | "link">("new");
  const [linkId, setLinkId] = useState("");
  const [name, setName] = useState(p.line.printed.replace(/_r$/i, "").replace(/\s*x\s*\d+\s*$/i, "").trim());
  const [theirName, setTheirName] = useState(p.line.printed);
  const [theirCode, setTheirCode] = useState(p.line.code);
  const [sku, setSku] = useState("");
  const autoSku = useRef("");
  const [cat, setCat] = useState("");
  const [stock, setStock] = useState(true);
  const purchaseCodes = p.unitsOf("purchase").map(u => u.code);
  const [bought, setBought] = useState(purchaseCodes.find(c => norm(c) === norm(p.line.unit)) ?? (size?.unit === "ml" && purchaseCodes.includes("Bot") ? "Bot" : ""));
  const [countQty, setCountQty] = useState(String(size?.pack ?? 1));
  const [counted, setCounted] = useState("");
  const [recipeQty, setRecipeQty] = useState(size ? String(Math.round(size.qty * size.pack * 1000) / 1000) : "1");
  const [recipe, setRecipe] = useState(size?.unit ?? "");
  const [account, setAccount] = useState("");
  const path = p.paths.find(x => x.id === cat);
  // The SKU fills from the category's Level 1 (FOD-0001…) unless one was typed.
  useEffect(() => {
    if (!path || (sku && sku !== autoSku.current)) return;
    let live = true;
    void nextSku(p.tenantId, path.l1).then(next => { if (live) { autoSku.current = next; setSku(next); } });
    return () => { live = false; };
  }, [path?.l1]); // eslint-disable-line react-hooks/exhaustive-deps
  const ruleKey = path ? `${path.group}__${path.l1}` : "";
  const needsAccount = !!path && !!path.group && !p.rules[ruleKey];
  const suggestedAccounts = path ? p.accounts.filter(a => path.group === "COGS" ? /cogs|cost/i.test(`${a.account_type} ${a.name}`) : path.group === "OpEx" ? /opex|expense/i.test(`${a.account_type}`) : true) : p.accounts;
  useEffect(() => { if (needsAccount && !account) { const guess = suggestedAccounts.find(a => path && a.name.toLowerCase().includes(path.l1.toLowerCase())); if (guess) setAccount(guess.id); } }, [needsAccount]); // eslint-disable-line react-hooks/exhaustive-deps
  const countedUnit = counted || bought;
  const price = p.line.price;
  const perStock = Number(countQty) > 0 ? price / Number(countQty) : 0;
  const perRecipe = Number(recipeQty) > 0 ? price / Number(recipeQty) : 0;
  const money = (n: number, d = 2) => `HK$${n.toLocaleString("en-HK", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  const lbl = (t: string, el: ReactNode) => <label className="flex min-w-0 flex-col gap-1"><span className="text-[11px] text-muted-foreground">{t}</span>{el}</label>;
  const unitSelect = (t: "purchase" | "stock" | "base", v: string, set: (v: string) => void, placeholder: string) =>
    <select className={field} value={v} onChange={e => set(e.target.value)}><option value="">{placeholder}</option>{p.unitsOf(t).map(u => <option key={u.code} value={u.code}>{u.label} ({u.code})</option>)}</select>;

  const link = async () => {
    const e = existing.find(x => x.id === linkId);
    if (!e) { p.setError("Pick the item"); return; }
    p.setBusy(true); p.setError("");
    let entry: SetupEntry = e;
    if (!(e.supplier_entry_id && norm(e.supplier) === norm(p.supplierName))) {
      const { data: pm } = await db.from("product_master").select("purchase_unit,stock_uom,stock_qty,base_unit_type,base_unit_qty").eq("id", e.id).single();
      const { data, error } = await db.from("product_suppliers").insert({ tenant_id: p.tenantId, product_master_id: e.id, supplier: p.supplierName, external_sku: p.line.code || "", supplier_product_name: p.line.printed, purchase_unit: pm?.purchase_unit ?? e.purchase_unit ?? "", purchase_unit_cost: price, stock_uom: pm?.stock_uom ?? "", stock_qty: pm?.stock_qty ?? 1, base_unit_type: pm?.base_unit_type ?? "", base_unit_qty: pm?.base_unit_qty ?? 1, status: "Active" }).select("id").single();
      if (error || !data) { p.setBusy(false); p.setError(error?.message ?? "Couldn't link the item"); return; }
      entry = { ...e, supplier_entry_id: data.id, supplier: p.supplierName, supplier_product_name: p.line.printed, external_sku: p.line.code || "", purchase_unit_cost: price, purchase_unit: pm?.purchase_unit ?? e.purchase_unit, stock_uom: pm?.stock_uom ?? e.stock_uom, stock_qty: pm?.stock_qty ?? e.stock_qty };
    }
    p.onLinked(p.line.index, entry);
    p.onDone(`Linked ${p.line.printed} to ${e.internal_product_name}`);
    p.setBusy(false);
  };

  const add = async () => {
    if (!name.trim()) return p.setError("Enter the item name");
    if (!path) return p.setError("Pick a category");
    if (!path.group) return p.setError(`${path.l1} has no group yet. Bani needs to set one on the control plane.`);
    if (!bought) return p.setError("Pick how it's bought");
    if (stock && (!countedUnit || !(Number(countQty) > 0))) return p.setError("Enter how it's counted");
    if (!recipe || !(Number(recipeQty) > 0)) return p.setError("Enter the recipe unit");
    if (needsAccount && !account) return p.setError(`Pick the account for ${path.l1}`);
    if (!sku.trim()) return p.setError("Enter the SKU");
    p.setBusy(true); p.setError("");
    if (needsAccount) {
      const { error } = await db.rpc("save_purchasing_setup", { p_tenant: p.tenantId, p_rows: [{ treatment: path.group, category: path.l1, new_treatment: null, account_id: account, venue_accounts: {} }], p_note: `Set from a chat invoice (${p.supplierName})` });
      if (error) { p.setBusy(false); p.setError(error.message); return; }
      p.onRule(ruleKey, account);
    }
    const { data: taken } = await db.from("product_master").select("id").eq("tenant_id", p.tenantId).eq("internal_sku", sku.trim()).limit(1);
    if (taken?.length) { p.setBusy(false); p.setError(`${sku.trim()} is already used. Pick another SKU.`); return; }
    const stockQ = stock ? Number(countQty) : 1;
    const { data: pm, error: e1 } = await db.from("product_master").insert({
      tenant_id: p.tenantId, internal_sku: sku.trim(), internal_product_name: name.trim(), supplier_product_name: theirName.trim() || p.line.printed, external_sku: theirCode.trim(),
      level1_category: path.l1, level2_category: path.l2, level3_category: path.l3, financial_treatment: path.group, default_coa_account_id: null,
      supplier: p.supplierName, status: "Active", unit: countedUnit, unit_cost: price / stockQ,
      purchase_unit: bought, purchase_unit_cost: price, stock_uom: countedUnit, stock_qty: stockQ, cost_per_stock_unit: price / stockQ,
      base_unit_type: recipe, base_unit_qty: Number(recipeQty), cost_per_base_unit: price / Number(recipeQty),
      creates_stock_movement: stock, purchase_yield: 100, cooking_yield: 100, notes: "Added from a Bani chat invoice",
    }).select("id").single();
    if (e1 || !pm) { p.setBusy(false); p.setError(e1?.message ?? "Couldn't add the item"); return; }
    const { data: ps, error: e2 } = await db.from("product_suppliers").insert({
      tenant_id: p.tenantId, product_master_id: pm.id, supplier: p.supplierName, external_sku: theirCode.trim(), supplier_product_name: theirName.trim() || p.line.printed,
      purchase_unit: bought, purchase_unit_cost: price, stock_uom: countedUnit, stock_qty: stockQ, base_unit_type: recipe, base_unit_qty: Number(recipeQty), status: "Active",
    }).select("id").single();
    if (e2 || !ps) { p.setBusy(false); p.setError(e2?.message ?? "Couldn't link the item to the supplier"); return; }
    p.onLinked(p.line.index, { id: pm.id, supplier_entry_id: ps.id, internal_sku: sku.trim(), external_sku: theirCode.trim(), internal_product_name: name.trim(), supplier_product_name: theirName.trim() || p.line.printed, purchase_unit_cost: price, supplier: p.supplierName, purchase_unit: bought, stock_uom: countedUnit, stock_qty: stockQ });
    p.onDone(`${name.trim()} added to the Items Master`);
    p.setBusy(false);
  };

  const card = "w-full max-w-[640px] rounded-2xl border bg-white p-4";
  return <>
    <p className="text-[14px]"><b className="font-medium">{p.line.printed}</b> · {money(price)} isn't in your Items Master yet.</p>
    <div className={card} style={{ borderColor: HAIR }}>
      <div className="mb-3 flex gap-4 text-[13px]">
        {(["new", "link"] as const).map(m => <button key={m} type="button" className={mode === m ? "font-medium text-foreground underline underline-offset-4" : "text-muted-foreground"} onClick={() => setMode(m)}>{m === "new" ? "New item" : "Already in the Items Master"}</button>)}
      </div>
      {mode === "link" ? <div className="space-y-3">
        {lbl("Item", <select className={field} value={linkId} onChange={e => setLinkId(e.target.value)}><option value="">Pick the item</option>{existing.map(e => <option key={e.id} value={e.id}>{e.internal_product_name}{e.supplier ? ` · ${e.supplier}` : ""}</option>)}</select>)}
        <div className="flex justify-end"><button type="button" disabled={p.busy} className="h-9 rounded-full bg-[#1F6B5E] px-4 text-[13px] font-medium text-white disabled:opacity-50" onClick={() => void link()}>{p.busy ? "Linking…" : "Link item"}</button></div>
      </div> : <div className="space-y-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {lbl("Supplier's name (as printed)", <input className={field} value={theirName} onChange={e => setTheirName(e.target.value)} />)}
          {lbl("Supplier's code", <input className={field} placeholder="None printed" value={theirCode} onChange={e => setTheirCode(e.target.value)} />)}
          {lbl("Your item name", <input className={field} value={name} onChange={e => setName(e.target.value)} />)}
          {lbl("Category", <select className={field} value={cat} onChange={e => setCat(e.target.value)}><option value="">Pick a category</option>{p.paths.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>)}
          {lbl("SKU", <input className={`${field} font-mono`} placeholder="Fills when you pick the category" value={sku} onChange={e => setSku(e.target.value)} />)}
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "0.8fr 1fr 1fr 1fr" }}>
          {lbl("Stock item", <select className={field} value={stock ? "yes" : "no"} onChange={e => setStock(e.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></select>)}
          {lbl("1 · Bought as", unitSelect("purchase", bought, setBought, "Pick a unit"))}
          {lbl("2 · Counted in", <div className="flex gap-1.5"><input className={`${field} w-14 text-center`} inputMode="decimal" disabled={!stock} value={countQty} onChange={e => setCountQty(e.target.value)} />{unitSelect("stock", counted, setCounted, bought || "Unit")}</div>)}
          {lbl("3 · Recipe unit", <div className="flex gap-1.5"><input className={`${field} w-20 text-center`} inputMode="decimal" value={recipeQty} onChange={e => setRecipeQty(e.target.value)} />{unitSelect("base", recipe, setRecipe, "Unit")}</div>)}
        </div>
        {needsAccount && lbl(`Account for ${path!.l1} (asked once, saved to Purchasing setup)`, <select className={field} value={account} onChange={e => setAccount(e.target.value)}><option value="">Pick the account</option>{suggestedAccounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>)}
        <p className="whitespace-nowrap text-[12px] text-muted-foreground">{money(price)} per {bought || "unit"}{stock && countedUnit ? ` · ${money(perStock)} per ${countedUnit} counted` : ""}{recipe ? ` · ${money(perRecipe, 4)} per ${recipe}` : ""}{path?.group ? ` · ${path.group === "COGS" ? "Cost of sales" : path.group}` : ""}</p>
        <div className="flex justify-end"><button type="button" disabled={p.busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1F6B5E] px-4 text-[13px] font-medium text-white disabled:opacity-50" onClick={() => void add()}>{p.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{p.busy ? "Adding…" : "Add item"}</button></div>
      </div>}
    </div>
  </>;
}
