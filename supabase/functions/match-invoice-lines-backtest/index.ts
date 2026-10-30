import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { allRows, authorize, InputSchema, matchInvoice, RequestError, safeError, MATCHER_MODEL } from '../match-invoice-lines/service.ts';
import { randomSample, summarize, type ResultRow } from './report.ts';

const Body = z.object({ tenant_id: z.string().uuid(), sample_size: z.number().int().min(1).max(50).default(50) }).strict();
type Invoice = { id: string; supplier_id: string; invoice_date: string; invoice_number: string };
type SavedLine = { id: string; description: string; scanned_description: string | null; item_code: string | null; scanned_item_code: string | null; unit: string | null; quantity: number; unit_price: number; total: number; printed_amount: number | null; product_master_id: string | null };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST required.' }), { status: 405, headers });
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers });
    const { admin } = await authorize(req, parsed.data.tenant_id, true);
    const tenantId = parsed.data.tenant_id;
    const eligible = await allRows<Invoice>((a, b) => admin.from('invoices').select('id,supplier_id,invoice_date,invoice_number').eq('tenant_id', tenantId).in('review_status', ['Approved', 'Disputed']).order('id').range(a, b));
    if (eligible.length < parsed.data.sample_size) throw new RequestError(400, `Only ${eligible.length} eligible invoices exist.`);
    const invoices = randomSample(eligible, parsed.data.sample_size);
    // This is an evaluation identifier, not a gateway run ID. Gateway IDs are only gateway-issued.
    const runId = crypto.randomUUID();
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const emit = (data: unknown) => controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
        const rows: ResultRow[] = [];
        const calls: unknown[] = [];
        let completed = 0;
        emit({ event: 'started', run_id: runId, model: MATCHER_MODEL, eligible_invoices: eligible.length, invoice_ids: invoices.map(i => i.id) });
        try {
          // One invoice-wide call at a time; terminal failures stop the entire run, never substitute or retry.
          for (const invoice of invoices) {
            if (req.signal.aborted) throw new RequestError(499, 'Backtest cancelled.');
            emit({ event: 'processing', invoice_id: invoice.id, invoice_number: invoice.invoice_number });
            const lines = await allRows<SavedLine>((a, b) => admin.from('invoice_line_items').select('id,description,scanned_description,item_code,scanned_item_code,unit,quantity,unit_price,total,printed_amount,product_master_id').eq('tenant_id', tenantId).eq('invoice_id', invoice.id).order('id').range(a, b));
            if (!lines.length) throw new RequestError(400, `Invoice ${invoice.invoice_number} has no lines.`);
            // Expected ids never enter matcher input or prompt.
            const input = InputSchema.parse({ tenant_id: tenantId, supplier_id: invoice.supplier_id, invoice_id: invoice.id, as_of_date: invoice.invoice_date, lines: lines.map((l, line_index) => ({ line_index, description: l.scanned_description ?? l.description, item_code: l.scanned_item_code ?? l.item_code, unit: l.unit, quantity: Number(l.quantity), unit_price: Number(l.unit_price), amount: Number(l.printed_amount ?? l.total) })) });
            const prediction = await matchInvoice(admin, input, req.signal);
            const saved: ResultRow[] = prediction.lines.map(p => {
              const expected = lines[p.line_index];
              if (!expected) throw new RequestError(502, 'Invalid returned line index.');
              return { invoice_id: invoice.id, line_id: expected.id, expected_product_id: expected.product_master_id, decision: p.decision, predicted_product_id: p.product_master_id, alternatives: p.alternatives, reason: p.reason, correct: expected.product_master_id === p.product_master_id };
            });
            const { error } = await admin.from('match_backtest_results').insert(saved.map(r => ({ ...r, tenant_id: tenantId, run_id: runId })));
            if (error) throw new RequestError(500, `Could not save evaluation results: ${error.message}`);
            rows.push(...saved); completed++;
            const call = { invoice_id: invoice.id, gateway_run_id: prediction.gateway_run_id, usage: prediction.usage, context_counts: prediction.context_counts };
            calls.push(call);
            emit({ event: 'invoice_complete', completed, ...call, lines: saved.length });
          }
          // Read back persisted results rather than report a success inferred from model output.
          const persisted = await allRows<ResultRow>((a, b) => admin.from('match_backtest_results').select('invoice_id,line_id,expected_product_id,predicted_product_id,alternatives,decision,reason,correct').eq('tenant_id', tenantId).eq('run_id', runId).order('line_id').range(a, b));
          emit({ event: 'complete', run_id: runId, invoices_completed: completed, ...summarize(persisted), calls, temporal_policy: 'Strictly pre-invoice-date evidence. Later mutable master fields reconstructed from earlier invoice lines or omitted; master rows created later are excluded.' });
        } catch (error) {
          const failure = safeError(error);
          emit({ event: 'error', status: failure.status, error: failure.error, run_id: runId, invoices_completed: completed, partial_report: summarize(rows), calls });
        } finally { controller.close(); }
      },
    });
    return new Response(body, { headers: { ...headers, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = safeError(error);
    return new Response(JSON.stringify({ error: failure.error }), { status: failure.status, headers });
  }
});