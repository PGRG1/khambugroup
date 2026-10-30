import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { getLovableAiGatewayResponseHeaders } from './run-id.ts';
import { authorize, InputSchema, matchInvoice, safeError } from './service.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST required.' }), { status: 405, headers });
  try {
    const parsed = InputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers });
    const { admin } = await authorize(req, parsed.data.tenant_id);
    const result = await matchInvoice(admin, parsed.data, req.signal);
    const { gateway_headers, ...body } = result;
    return new Response(JSON.stringify(body), { headers: getLovableAiGatewayResponseHeaders(gateway_headers, headers) });
  } catch (error) {
    const failure = safeError(error);
    return new Response(JSON.stringify({ error: failure.error }), { status: failure.status, headers });
  }
});