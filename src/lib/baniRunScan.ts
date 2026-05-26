/**
 * Bani — post-scan AI orchestrator.
 *
 * Runs four batched calls after an invoice is saved (or when "Re-run Bani"
 * is clicked on the review screen), then caches everything on the invoice
 * and line items. The review UI reads from these cache columns and never
 * fires AI on mount.
 *
 * Steps (all server-batched via the ai-classify edge function):
 *   1. supplier_match       — header
 *   2. line_to_product      — per line, rule-cache first
 *   3. invoice_categorize   — per line, rule-cache first
 *   4. invoice_anomaly      — invoice + history (Pro fallback allowed once)
 *
 * Cache shape:
 *   invoices.ai_suggestions  = { supplier, header_defaults, ... }
 *   invoices.ai_anomaly      = { checked_at, model_used, confidence, flags }
 *   invoices.ai_extract_meta = { model_used, pro_used, parsed_at }
 *   invoice_line_items.ai_suggestion = { product, category, coa, venue, inventory, confidence, needs_review_reason }
 *   invoice_line_items.normalized_unit_cost / pack_size_norm / unit_norm
 */
import { supabase } from "@/integrations/supabase/client";

const DOMAIN = "procurement";

async function callBatch(workflow: string, items: any[], context: any, tenant_id: string, invoice_id: string) {
  const { data, error } = await supabase.functions.invoke("ai-classify", {
    body: {
      op: "suggest_batch",
      domain: DOMAIN,
      workflow,
      tenant_id,
      invoice_id,
      items,
      context,
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { results: any[]; model_used: string | null };
}

async function callSingle(workflow: string, input: any, context: any, tenant_id: string, invoice_id: string) {
  const { data, error } = await supabase.functions.invoke("ai-classify", {
    body: {
      op: "suggest",
      domain: DOMAIN,
      workflow,
      tenant_id,
      invoice_id,
      input,
      context,
    },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { suggestion: any; confidence: number; rule_pattern: any; source: string; model_used?: string };
}

export interface BaniRunOptions {
  invoiceId: string;
  tenantId: string;
  /** When true the orchestrator overwrites existing cache. Default: true. */
  force?: boolean;
  /** Optional callback for UI progress. */
  onProgress?: (stage: "supplier" | "products" | "categorize" | "anomaly" | "done") => void;
}

export async function runBaniScan(opts: BaniRunOptions): Promise<{ ok: boolean; error?: string }> {
  const { invoiceId, tenantId, force = true, onProgress } = opts;

  try {
    // Load the invoice + lines + minimal context.
    const [{ data: invoice }, { data: lines }] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
      supabase.from("invoice_line_items").select("*").eq("invoice_id", invoiceId).order("created_at"),
    ]);
    if (!invoice) return { ok: false, error: "invoice_not_found" };
    if (!force && invoice.ai_suggestions) return { ok: true };

    const [
      { data: suppliers },
      { data: categories },
      { data: products },
      { data: coa },
      { data: venues },
    ] = await Promise.all([
      (supabase as any).from("suppliers").select("id, name").eq("is_active", true).limit(2000),
      (supabase as any).from("expense_categories").select("id, name").limit(2000),
      (supabase as any).from("product_master").select("id, internal_sku, internal_product_name, supplier_product_name, external_sku, supplier"),
      (supabase as any).from("chart_of_accounts").select("id, code, name").limit(2000),
      (supabase as any).from("venues").select("name").eq("active", true).limit(50),
    ]);

    const supplierName = (suppliers ?? []).find((s: any) => s.id === invoice.supplier_id)?.name ?? null;

    // ============ 1. supplier_match (only if header supplier is missing) ============
    onProgress?.("supplier");
    let supplierSuggestion: any = null;
    if (!invoice.supplier_id && (invoice as any).legacy_venue_name) {
      try {
        const sres = await callSingle(
          "supplier_match",
          {
            raw_supplier_name: (invoice as any).legacy_venue_name ?? "",
            address_text: "",
          },
          { candidates: (suppliers ?? []).slice(0, 200) },
          tenantId,
          invoiceId,
        );
        supplierSuggestion = { ...sres.suggestion, confidence: sres.confidence };
      } catch (e) { console.warn("supplier_match failed", e); }
    } else if (supplierName) {
      supplierSuggestion = { supplier_id: invoice.supplier_id, supplier_name: supplierName, confidence: 1, source: "header" };
    }

    // ============ 2. line_to_product (batched) ============
    onProgress?.("products");
    const productItems = (lines ?? []).map((l: any) => ({
      line_id: l.id,
      supplier_id: invoice.supplier_id,
      item_code: l.item_code ?? "",
      description: l.description ?? "",
      pack_size: l.pack_size ?? "",
      unit: l.unit ?? "",
      unit_price: Number(l.unit_price ?? 0),
    }));
    let productResults: any[] = [];
    if (productItems.length > 0) {
      try {
        const pres = await callBatch(
          "line_to_product",
          productItems,
          { candidates: (products ?? []).slice(0, 500) },
          tenantId,
          invoiceId,
        );
        productResults = pres.results ?? [];
      } catch (e) { console.warn("line_to_product failed", e); }
    }

    // ============ 3. invoice_categorize (batched, per line) ============
    onProgress?.("categorize");
    const catItems = (lines ?? []).map((l: any, idx: number) => ({
      line_id: l.id,
      supplier_id: invoice.supplier_id,
      product_master_id: l.product_master_id ?? productResults[idx]?.suggestion?.product_master_id ?? null,
      description: l.description ?? "",
      line_total: Number(l.total ?? 0),
    }));
    let categorizeResults: any[] = [];
    if (catItems.length > 0) {
      try {
        const cres = await callBatch(
          "invoice_categorize",
          catItems,
          {
            categories: (categories ?? []).slice(0, 500),
            coa_accounts: (coa ?? []).slice(0, 500),
            venues: (venues ?? []).map((v: any) => v.name),
            invoice_venue: invoice.venue ?? null,
          },
          tenantId,
          invoiceId,
        );
        categorizeResults = cres.results ?? [];
      } catch (e) { console.warn("invoice_categorize failed", e); }
    }

    // Merge product + categorize suggestions per line and persist.
    for (let i = 0; i < (lines ?? []).length; i++) {
      const line = lines![i];
      const prod = productResults[i] ?? null;
      const cat = categorizeResults[i] ?? null;
      const merged = {
        product: prod?.suggestion ?? null,
        category: cat?.suggestion ?? null,
        confidence: Math.min(
          Number(prod?.confidence ?? 1),
          Number(cat?.confidence ?? 1),
        ),
        needs_review_reason:
          prod?.suggestion?.needs_review_reason ?? null,
        sources: { product: prod?.source ?? null, category: cat?.source ?? null },
      };
      await supabase
        .from("invoice_line_items")
        .update({
          ai_suggestion: merged,
          normalized_unit_cost: prod?.normalized_unit_cost ?? null,
          pack_size_norm: prod?.pack_size_norm ?? null,
          unit_norm: prod?.unit_norm ?? null,
        } as any)
        .eq("id", line.id);
    }

    // ============ 4. invoice_anomaly (single call, Pro fallback allowed once) ============
    onProgress?.("anomaly");
    let anomalyOut: any = null;
    try {
      // Reload lines with the normalized_unit_cost we just wrote so anomaly sees it.
      const { data: linesWithNorm } = await supabase
        .from("invoice_line_items")
        .select("id, product_master_id, normalized_unit_cost, quantity, unit_price")
        .eq("invoice_id", invoiceId);

      const productIds = (linesWithNorm ?? [])
        .map((l: any) => l.product_master_id)
        .filter((id: string | null): id is string => !!id);

      // Pull 90-day medians via a single query.
      let history: Array<{ product_master_id: string; median_90d: number; n_observations: number }> = [];
      if (invoice.supplier_id && productIds.length > 0) {
        const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
        const { data: hist } = await supabase
          .from("invoice_line_items")
          .select("product_master_id, normalized_unit_cost, invoices!inner(invoice_date, supplier_id)")
          .in("product_master_id", productIds)
          .gte("invoices.invoice_date", cutoff)
          .eq("invoices.supplier_id", invoice.supplier_id)
          .not("normalized_unit_cost", "is", null)
          .limit(5000);
        const by: Record<string, number[]> = {};
        for (const r of hist ?? []) {
          const pid = (r as any).product_master_id as string;
          (by[pid] ||= []).push(Number((r as any).normalized_unit_cost));
        }
        history = Object.entries(by).map(([pid, arr]) => {
          arr.sort((a, b) => a - b);
          const mid = arr.length >> 1;
          const median = arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
          return { product_master_id: pid, median_90d: Number(median.toFixed(6)), n_observations: arr.length };
        });
      }

      // Duplicate check
      let duplicates: any[] = [];
      if (invoice.supplier_id && invoice.invoice_number) {
        const { data: dup } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, total_amount")
          .eq("supplier_id", invoice.supplier_id)
          .eq("invoice_number", invoice.invoice_number)
          .neq("id", invoiceId)
          .limit(3);
        duplicates = dup ?? [];
      }

      const ares = await callSingle(
        "invoice_anomaly",
        {
          invoice: {
            id: invoice.id,
            supplier_id: invoice.supplier_id,
            supplier_name: supplierName,
            invoice_number: invoice.invoice_number,
            invoice_date: invoice.invoice_date,
            total_amount: Number(invoice.total_amount ?? 0),
          },
          lines: linesWithNorm ?? [],
          history_window: history,
          duplicates_check: duplicates,
        },
        null,
        tenantId,
        invoiceId,
      );
      anomalyOut = {
        checked_at: new Date().toISOString(),
        model_used: ares.model_used ?? "gemini-2.5-flash",
        confidence: ares.confidence ?? 0.7,
        flags: ares.suggestion?.flags ?? [],
      };
    } catch (e) {
      console.warn("invoice_anomaly failed", e);
      anomalyOut = {
        checked_at: new Date().toISOString(),
        model_used: "error",
        confidence: 0,
        flags: [],
        error: (e as Error)?.message ?? String(e),
      };
    }

    // ============ Persist header cache ============
    await supabase
      .from("invoices")
      .update({
        ai_suggestions: {
          supplier: supplierSuggestion,
          header_defaults: { venue: invoice.venue ?? null },
          checked_at: new Date().toISOString(),
        },
        ai_anomaly: anomalyOut,
        ai_extract_meta: {
          parsed_at: new Date().toISOString(),
          model_used: "gemini-2.5-flash",
          pro_used: anomalyOut?.model_used === "gemini-2.5-pro",
        },
      } as any)
      .eq("id", invoiceId);

    onProgress?.("done");
    return { ok: true };
  } catch (e) {
    console.error("runBaniScan failed", e);
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}
