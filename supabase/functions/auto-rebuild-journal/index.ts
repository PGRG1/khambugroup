// Scheduled auto-rebuild of tenant journals.
// Runs every 1–2 minutes via pg_cron. Picks up tenants whose pending_rebuilds
// row is older than the debounce window (default 180s), calls the service-role
// system rebuild, and clears the pending row on success. Failures leave the
// row in place so the next tick retries — the error is logged to
// ledger_audit_log for visibility.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEBOUNCE_SECONDS = 180;
const MAX_PER_TICK = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: due, error: fetchErr } = await admin.rpc(
    "fetch_due_pending_rebuilds",
    { p_debounce_seconds: DEBOUNCE_SECONDS },
  );
  if (fetchErr) {
    console.error("[auto-rebuild] fetch failed:", fetchErr);
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (due ?? []).slice(0, MAX_PER_TICK) as Array<{
    tenant_id: string;
    requested_at: string;
    attempts: number;
  }>;

  const results: Array<{ tenant_id: string; ok: boolean; error?: string; entries?: number }> = [];

  for (const row of rows) {
    const startedAt = new Date().toISOString();
    try {
      const { data, error } = await admin.rpc(
        "rebuild_journal_from_operations_system",
        { p_tenant_id: row.tenant_id },
      );
      if (error) throw error;
      // Success: clear the pending row (only if no newer request landed).
      await admin
        .from("pending_rebuilds")
        .delete()
        .eq("tenant_id", row.tenant_id)
        .lte("requested_at", row.requested_at);
      results.push({
        tenant_id: row.tenant_id,
        ok: true,
        entries: (data as any)?.entries_created ?? 0,
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.error(`[auto-rebuild] tenant ${row.tenant_id} failed:`, msg);
      // Bump attempts + record error; leave the row so the next tick retries.
      await admin
        .from("pending_rebuilds")
        .update({
          attempts: (row.attempts ?? 0) + 1,
          last_error: msg.slice(0, 500),
          last_attempt_at: startedAt,
        })
        .eq("tenant_id", row.tenant_id);
      await admin.from("ledger_audit_log").insert({
        event_type: "ledger_auto_rebuild",
        user_id: null,
        user_display_name: "system (auto-rebuild)",
        status: "error",
        notes: `Auto-rebuild failed: ${msg.slice(0, 400)}`,
        tenant_id: row.tenant_id,
      });
      results.push({ tenant_id: row.tenant_id, ok: false, error: msg });
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
