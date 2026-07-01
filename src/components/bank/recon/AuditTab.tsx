import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Row = { id: string; ts: string; action: string; old_status: string | null; new_status: string | null; user_display_name: string | null; bank_account_id: string | null; bank_transaction_id: string | null; notes: any };

export function AuditTab() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("bank_audit_trail" as any)
        .select("*")
        .order("ts", { ascending: false })
        .limit(500);
      setRows((data as any) || []);
    })();
  }, []);
  return (
    <Card className="card-glass">
      <CardHeader><CardTitle className="text-base">Audit Trail</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-2 px-2">When</th>
              <th className="text-left py-2 px-2">User</th>
              <th className="text-left py-2 px-2">Action</th>
              <th className="text-left py-2 px-2">Status change</th>
              <th className="text-left py-2 px-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No audit events yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="py-2 px-2 text-xs text-muted-foreground">{new Date(r.ts).toLocaleString()}</td>
                <td className="py-2 px-2">{r.user_display_name || "—"}</td>
                <td className="py-2 px-2">{r.action}</td>
                <td className="py-2 px-2 text-xs">{r.old_status || "—"} → {r.new_status || "—"}</td>
                <td className="py-2 px-2 text-xs text-muted-foreground font-mono truncate max-w-[420px]">{r.notes ? JSON.stringify(r.notes) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
