import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  default_account_id: string | null;
  description: string | null;
}

export default function ExpenseCategories() {
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
    const payload = {
      name: editing.name,
      default_account_id: editing.default_account_id || null,
      description: editing.description || null,
    };
    const { error } = editing.id
      ? await supabase.from("expense_categories").update(payload).eq("id", editing.id)
      : await supabase.from("expense_categories").insert(payload);
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Expense Categories</h1>
          <p className="text-sm text-muted-foreground">Manage categories and their default GL account.</p>
        </div>
        <Button onClick={() => { setEditing({}); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> New Category</Button>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Default Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const acct = accounts.find((a) => a.id === r.default_account_id);
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => { setEditing(r); setOpen(true); }}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{acct ? `${acct.code} — ${acct.name}` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.description || "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!rows.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No categories</TableCell></TableRow>}
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
              <Label>Default Account</Label>
              <Select value={editing.default_account_id || ""} onValueChange={(v) => setEditing((p) => ({ ...p, default_account_id: v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={editing.description || ""} onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))} />
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
