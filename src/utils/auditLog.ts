import { supabase } from "@/integrations/supabase/client";

export type AuditAction = "insert" | "update" | "delete" | "bulk_upload" | "bulk_delete" | "attach_receipt";
export type AuditEntityType = "sales_record" | "forecast";

interface AuditLogEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  details?: Record<string, any>;
}

export async function logAuditEvent({ action, entityType, entityId, details }: AuditLogEntry) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get display name from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single();

    await supabase.from("audit_log").insert({
      user_id: user.id,
      user_display_name: profile?.display_name || user.email || "Unknown",
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || {},
    });
  } catch (err) {
    console.error("Audit log error:", err);
  }
}
