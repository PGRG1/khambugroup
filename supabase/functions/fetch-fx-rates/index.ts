import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Daily reference rates (1 USD = n units) for ~160 ISO currencies from a free public source.
const SOURCE = 'https://open.er-api.com/v6/latest/USD';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) return json({ error: `Rate source returned ${res.status}` }, 502);
    const data = await res.json();
    if (data?.result !== 'success' || typeof data.rates !== 'object') return json({ error: 'Rate source gave no rates' }, 502);
    const day = new Date(Number(data.time_last_update_unix) * 1000).toISOString().slice(0, 10);
    const rows = Object.entries(data.rates as Record<string, number>)
      .filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && Number(rate) > 0)
      .map(([code, rate]) => ({ rate_date: day, quote_currency: code, usd_rate: Number(rate), source: 'open.er-api.com', fetched_at: new Date().toISOString() }));
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await db.from('fx_reference_rates').upsert(rows, { onConflict: 'rate_date,quote_currency' });
    if (error) return json({ error: error.message }, 500);
    return json({ date: day, currencies: rows.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
