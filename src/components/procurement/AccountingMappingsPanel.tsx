import React, { useMemo, useState } from "react";
import { useAccountingCategories, AccountingCategory } from "@/hooks/useAccountingCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATEMENTS = ["P&L", "Balance Sheet"];
const GROUP_OPTIONS: Record<string, string[]> = {
  "P&L": ["Revenue", "COGS", "OpEx", "Other Income", "Other Expense"],
  "Balance Sheet": ["Asset", "Liability", "Equity"],
};

export default function AccountingMappingsPanel() {
  const { items, loading, createItem, updateItem, deleteItem } = useAccountingCategories();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStatement, setNewStatement] = useState("P&L");
  const [newGroup, setNewGroup] = useState("COGS");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatement, setEditStatement] = useState("P&L");
  const [editGroup, setEditGroup] = useState("COGS");
  const [deleting, setDeleting] = useState<AccountingCategory | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<string, AccountingCategory[]>();
    for (const it of items) {
      const key = `${it.statement} • ${it.category_group}`;
      const arr = m.get(key) || [];
      arr.push(it);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const handleAdd = async () => {
    const created = await createItem({ name: newName, statement: newStatement, category_group: newGroup });
    if (created) {
      setNewName("");
      setAdding(false);
    }
  };

  const startEdit = (it: AccountingCategory) => {
    setEditingId(it.id);
    setEditName(it.name);
    setEditStatement(it.statement);
    setEditGroup(it.category_group);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateItem(editingId, { name: editName.trim(), statement: editStatement, category_group: editGroup });
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Map products to where they appear on the financial statements: P&L COGS, P&L OpEx, or Balance Sheet items.
          These mappings show up as a dropdown when editing a product.
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Mapping
          </Button>
        )}
      </div>

      {adding && (
        <div className="card-glass rounded-xl p-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[11px] text-muted-foreground">Name</label>
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. COGS - Wine"
              className="h-9 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Statement</label>
            <Select value={newStatement} onValueChange={(v) => { setNewStatement(v); setNewGroup(GROUP_OPTIONS[v][0]); }}>
              <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATEMENTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Group</label>
            <Select value={newGroup} onValueChange={setNewGroup}>
              <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GROUP_OPTIONS[newStatement].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleAdd}><Check className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}><X className="h-4 w-4" /></Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([groupKey, list]) => (
            <div key={groupKey} className="card-glass rounded-xl">
              <div className="px-4 py-2 border-b border-border/40 text-xs font-semibold text-muted-foreground">
                {groupKey} <span className="text-muted-foreground/60">({list.length})</span>
              </div>
              <ul className="divide-y divide-border/30">
                {list.map(it => {
                  const isEditing = editingId === it.id;
                  return (
                    <li key={it.id} className="px-3 py-2 flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm flex-1" />
                          <Select value={editStatement} onValueChange={(v) => { setEditStatement(v); setEditGroup(GROUP_OPTIONS[v][0]); }}>
                            <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{STATEMENTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select value={editGroup} onValueChange={setEditGroup}>
                            <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{GROUP_OPTIONS[editStatement].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                          </Select>
                          <button onClick={saveEdit} className="p-1 text-primary hover:bg-primary/10 rounded"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-accent rounded"><X className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm">{it.name}</span>
                          <span className="text-[10px] text-muted-foreground">{it.statement} • {it.category_group}</span>
                          <button onClick={() => startEdit(it)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => setDeleting(it)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No accounting mappings yet. Add your first one above.</p>
          )}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing products mapped to this category keep the text value but lose the link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deleting) await deleteItem(deleting.id); setDeleting(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
