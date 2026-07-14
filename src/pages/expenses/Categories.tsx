import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FolderTree, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";
import {
  PageHeader,
  StatusPill,
  TableSkeleton,
  EmptyState,
  ScopeLine,
  useConfirm,
} from "@/components/expenses/shared";

interface Category {
  id: string;
  name: string;
  default_account_id: string | null;
  description: string | null;
  parent_category_id: string | null;
  is_active: boolean;
}

const NONE = "__none__";

export default function ExpenseCategories() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [rows, setRows] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Category>>({});
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [c, a] = await Promise.all([
      // Server-side tenant filter (belt & braces beyond RLS).
      supabase
        .from("expense_categories")
        .select("id,name,default_account_id,description,parent_category_id,is_active")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("chart_of_accounts")
        .select("id,code,name")
        .eq("tenant_id", tenantId)
        .order("code"),
    ]);
    setRows((c.data || []) as any);
    setAccounts((a.data || []) as any);
    setLoading(false);
  };

  useEffect(() => {
    if (!tenantLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantLoading]);

  const save = async () => {
    if (!editing.name) return;
    const basePayload = {
      name: editing.name,
      default_account_id: editing.default_account_id || null,
      description: editing.description || null,
      parent_category_id: editing.parent_category_id || null,
      is_active: editing.is_active ?? true,
    };
    const { error } = editing.id
      ? await supabase.from("expense_categories").update(basePayload).eq("id", editing.id).eq("tenant_id", tenantId!)
      : await supabase.from("expense_categories").insert({ ...basePayload, tenant_id: tenantId } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete category?")) return;
    const { error } = await supabase.from("expense_categories").delete().eq("id", id).eq("tenant_id", tenantId!);
    if (error) toast.error(error.message);
    else load();
  };

  const toggleActive = async (r: Category) => {
    const { error } = await supabase
      .from("expense_categories")
      .update({ is_active: !r.is_active })
      .eq("id", r.id)
      .eq("tenant_id", tenantId!);
    if (error) toast.error(error.message);
    else load();
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && !r.is_active) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, showInactive]);

  const ordered = useMemo(() => {
    const idset = new Set(visible.map((r) => r.id));
    const parents = visible.filter((r) => !r.parent_category_id);
    const result: { row: Category; isChild: boolean }[] = [];
    for (const p of parents) {
      result.push({ row: p, isChild: false });
      visible
        .filter((c) => c.parent_category_id === p.id)
        .forEach((c) => result.push({ row: c, isChild: true }));
    }
    for (const r of visible) {
      if (r.parent_category_id && !idset.has(r.parent_category_id)) {
        result.push({ row: r, isChild: false });
      }
    }
    return result;
  }, [visible]);

  const parentOptions = rows.filter((r) => !r.parent_category_id && r.id !== editing.id);
  const activeCount = rows.filter((r) => r.is_active).length;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Expense Categories"
        description="Master list of expense categories with a default GL account. Every bill allocation should map to one of these."
        actions={
          <Button size="sm" className="h-9" onClick={() => { setEditing({ is_active: true }); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New category
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="Search category or description…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="show-inactive" className="text-xs">Show inactive</Label>
        </div>
        <div className="flex-1" />
        <ScopeLine>
          {ordered.length} of {rows.length} · {activeCount} active
        </ScopeLine>
      </div>

      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Default account</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map(({ row: r, isChild }, idx) => {
                  const acct = accounts.find((a) => a.id === r.default_account_id);
                  return (
                    <TableRow
                      key={r.id}
                      className={`cursor-pointer ${idx % 2 === 0 ? "bg-muted/20" : ""} hover:bg-muted/40`}
                      onClick={() => { setEditing(r); setOpen(true); }}
                    >
                      <TableCell className={`py-2 px-3 font-medium ${isChild ? "pl-6 text-muted-foreground" : ""}`}>
                        {isChild ? <span className="text-muted-foreground/60 mr-1">└</span> : null}
                        {r.name}
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        {acct ? <span className="font-mono text-xs">{acct.code}</span> : <span className="text-muted-foreground">—</span>}
                        {acct && <span className="ml-2 text-muted-foreground">{acct.name}</span>}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground max-w-[280px] truncate">{r.description || "—"}</TableCell>
                      <TableCell className="py-2 px-3" onClick={(e) => { e.stopPropagation(); toggleActive(r); }}>
                        <StatusPill variant={r.is_active ? "success" : "muted"} className="cursor-pointer">
                          {r.is_active ? "Active" : "Inactive"}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState
                        icon={<FolderTree className="h-6 w-6" />}
                        title="No expense categories yet"
                        description="Categories are the foundation — every bill allocation maps to one, and each category can carry a default GL account so posting is automatic."
                        action={
                          <Button size="sm" className="h-8" onClick={() => { setEditing({ is_active: true }); setOpen(true); }}>
                            <Plus className="h-3 w-3 mr-1" /> Add first category
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {rows.length > 0 && !ordered.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No categories match “{search}”.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
          <SheetHeader><SheetTitle>{editing.id ? "Edit" : "New"} Category</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <div>
              <Label>Name *</Label>
              <Input value={editing.name || ""} onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Sub-category of</Label>
              <Select
                value={editing.parent_category_id || NONE}
                onValueChange={(v) => setEditing((p) => ({ ...p, parent_category_id: v === NONE ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None (top level) —</SelectItem>
                  {parentOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default GL account</Label>
              <Select
                value={editing.default_account_id || NONE}
                onValueChange={(v) => setEditing((p) => ({ ...p, default_account_id: v === NONE ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Bills allocated to this category will post to this account by default.
              </p>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={editing.description || ""} onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <Label className="text-sm">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive categories are hidden from selection.</p>
              </div>
              <Switch
                checked={editing.is_active ?? true}
                onCheckedChange={(v) => setEditing((p) => ({ ...p, is_active: v }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
