import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";

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
  const { tenantId } = useActiveTenant();
  const [rows, setRows] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Category>>({});

  const load = async () => {
    const [c, a] = await Promise.all([
      supabase.from("expense_categories").select("*").order("name"),
      supabase.from("chart_of_accounts").select("id,code,name").order("code"),
    ]);
    setRows((c.data || []) as any);
    setAccounts((a.data || []) as any);
  };

  useEffect(() => { load(); }, []);

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
      ? await supabase.from("expense_categories").update(basePayload).eq("id", editing.id)
      : await supabase.from("expense_categories").insert({ ...basePayload, tenant_id: tenantId } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete category?")) return;
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const toggleActive = async (r: Category) => {
    const { error } = await supabase
      .from("expense_categories")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else load();
  };

  // Hierarchical render: parents first, children indented beneath.
  const ordered = useMemo(() => {
    const parents = rows.filter((r) => !r.parent_category_id);
    const result: { row: Category; isChild: boolean }[] = [];
    for (const p of parents) {
      result.push({ row: p, isChild: false });
      rows
        .filter((c) => c.parent_category_id === p.id)
        .forEach((c) => result.push({ row: c, isChild: true }));
    }
    // Orphan children (parent missing) — render at end as roots
    for (const r of rows) {
      if (r.parent_category_id && !rows.find((x) => x.id === r.parent_category_id)) {
        result.push({ row: r, isChild: false });
      }
    }
    return result;
  }, [rows]);

  const parentOptions = rows.filter((r) => !r.parent_category_id && r.id !== editing.id);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Expense Categories</h1>
          <p className="text-sm text-muted-foreground">Manage categories and their default GL account.</p>
        </div>
        <Button onClick={() => { setEditing({ is_active: true }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> New Category
        </Button>
      </div>

      <Card className="card-glass p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Default Account</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map(({ row: r, isChild }, idx) => {
              const acct = accounts.find((a) => a.id === r.default_account_id);
              return (
                <TableRow
                  key={r.id}
                  className={`cursor-pointer ${idx % 2 === 0 ? "bg-muted/30" : ""} hover:bg-muted/20`}
                  onClick={() => { setEditing(r); setOpen(true); }}
                >
                  <TableCell className={`py-2 px-3 font-medium ${isChild ? "pl-6 text-muted-foreground" : ""}`}>
                    {isChild ? <span className="text-muted-foreground/60 mr-1">└</span> : null}
                    {r.name}
                  </TableCell>
                  <TableCell className="py-2 px-3">{acct ? `${acct.code} — ${acct.name}` : "—"}</TableCell>
                  <TableCell className="py-2 px-3 text-muted-foreground">{r.description || "—"}</TableCell>
                  <TableCell className="py-2 px-3" onClick={(e) => { e.stopPropagation(); toggleActive(r); }}>
                    {r.is_active ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="cursor-pointer">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No categories
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[480px] sm:max-w-[480px]">
          <SheetHeader><SheetTitle>{editing.id ? "Edit" : "New"} Category</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <div>
              <Label>Name</Label>
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
              <Label>Default Account</Label>
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
