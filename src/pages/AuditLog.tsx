import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { FileText } from "lucide-react";
import { DataTableShell, DataTablePagination } from "@/components/common/data-table";
import { Card } from "@/components/ui/card";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import {formatDate,formatTableInteger} from '@/utils/format';

interface AuditEntry {
  id: string;
  user_display_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  created_at: string;
}

const actionLabels: Record<string, { label: string; color: string }> = {
  insert: { label: "Created", color: "text-emerald-600 bg-emerald-500/10" },
  update: { label: "Edited", color: "text-amber-600 bg-amber-500/10" },
  delete: { label: "Deleted", color: "text-red-500 bg-red-500/10" },
  bulk_upload: { label: "Bulk Upload", color: "text-blue-600 bg-blue-500/10" },
  bulk_delete: { label: "Bulk Delete", color: "text-red-500 bg-red-500/10" },
};

const entityLabels: Record<string, string> = {
  sales_record: "Sales Record",
  forecast: "Forecast",
};

const AuditLog = () => {
  const {tenantId}=useActiveTenant();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchLogs = async () => {
      if(!tenantId){setEntries([]);setTotal(0);setLoading(false);return;}
      setLoading(true);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await supabase
        .from("audit_log")
        .select("*", { count: "exact" })
        .eq('tenant_id',tenantId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (!error && data) {
        setEntries(data as AuditEntry[]);
        setTotal(count || 0);
      }
      setLoading(false);
    };
    fetchLogs();
  }, [page, pageSize,tenantId]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  return (
    <div className="w-full mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold font-display">Activity</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {formatTableInteger(total)} entries · Current company
        </p>
      </div>

      <section className="card-glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-muted-foreground text-sm text-center py-8">Loading...</p>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date & Time</TableHead>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Type</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Record</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const action = actionLabels[entry.action] || { label: entry.action, color: "text-muted-foreground bg-muted" };
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs break-words">{formatDate(entry.created_at)}</TableCell>
                      <TableCell className="text-xs font-medium break-words">{entry.user_display_name}</TableCell>
                      <TableCell>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${action.color}`}>
                          {action.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs hidden sm:table-cell break-words">{entityLabels[entry.entity_type] || entry.entity_type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono hidden sm:table-cell break-all">{entry.entity_id || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden sm:table-cell break-words">
                        {entry.details && Object.keys(entry.details).length > 0
                          ? entry.action === "bulk_upload"
                            ? `${entry.details.count} records`
                            : JSON.stringify(entry.details).slice(0, 80)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      </section>
    </div>
  );
};

export default AuditLog;
