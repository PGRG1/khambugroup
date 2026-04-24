import React, { useMemo, useState } from "react";
import { useUomOptions, UomOption, UomType } from "@/hooks/useUomOptions";
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

const TYPES: { value: UomType; label: string; hint: string }[] = [
  { value: "base", label: "Base / Recipe", hint: "Smallest unit used in recipes (g, ml, each…)" },
  { value: "stock", label: "Stock", hint: "How you count inventory (Bottle, Pack, Bag…)" },
  { value: "purchase", label: "Purchase", hint: "How you order from suppliers (Case, Carton, Pallet…)" },
];

export default function UomOptionsPanel() {
  const { items, loading, createItem, updateItem, deleteItem } = useUomOptions();
  const [adding, setAdding] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<UomType>("base");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState<UomType>("base");
  const [deleting, setDeleting] = useState<UomOption | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<UomType, UomOption[]>();
    for (const it of items) {
      const arr = m.get(it.uom_type) || [];
      arr.push(it);
      m.set(it.uom_type, arr);
    }
    return m;
  }, [items]);

  const handleAdd = async () => {
    const created = await createItem({ code: newCode, label: newLabel || newCode, uom_type: newType });
    if (created) { setNewCode(""); setNewLabel(""); setAdding(false); }
  };

  const startEdit = (it: UomOption) => {
    setEditingId(it.id);
    setEditCode(it.code);
    setEditLabel(it.label);
    setEditType(it.uom_type);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateItem(editingId, { code: editCode.trim(), label: editLabel.trim(), uom_type: editType });
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Standardized units of measure used across Product Master, invoice scanning and recipes. Grouped by where they apply.
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add UOM
          </Button>
        )}
      </div>

      {adding && (
        <div className="card-glass rounded-xl p-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Type</label>
            <Select value={newType} onValueChange={(v) => setNewType(v as UomType)}>
              <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Code</label>
            <Input autoFocus value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="kg" className="h-9 w-[120px] text-sm" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[11px] text-muted-foreground">Label</label>
            <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Kilograms (kg)" className="h-9 text-sm" />
          </div>
          <Button size="sm" onClick={handleAdd}><Check className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewCode(""); setNewLabel(""); }}><X className="h-4 w-4" /></Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TYPES.map(t => {
            const list = grouped.get(t.value) || [];
            return (
              <div key={t.value} className="card-glass rounded-xl flex flex-col min-h-[300px]">
                <div className="px-4 py-3 border-b border-border/40">
                  <h3 className="text-sm font-semibold">{t.label}</h3>
                  <p className="text-[11px] text-muted-foreground">{t.hint}</p>
                </div>
                <ul className="divide-y divide-border/30 flex-1 overflow-y-auto">
                  {list.length === 0 && (
                    <li className="px-4 py-6 text-xs text-muted-foreground text-center">No units yet</li>
                  )}
                  {list.map(it => {
                    const isEditing = editingId === it.id;
                    return (
                      <li key={it.id} className="px-3 py-2 flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <Input value={editCode} onChange={e => setEditCode(e.target.value)} className="h-7 w-[80px] text-xs font-mono" />
                            <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="h-7 text-xs flex-1" />
                            <button onClick={saveEdit} className="p-1 text-primary hover:bg-primary/10 rounded"><Check className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-accent rounded"><X className="h-3.5 w-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <span className="font-mono text-xs font-semibold w-[60px]">{it.code}</span>
                            <span className="flex-1 text-xs text-muted-foreground truncate">{it.label}</span>
                            <button onClick={() => startEdit(it)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                            <button onClick={() => setDeleting(it)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.code}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing products using this UOM keep the text value but it will no longer appear as a default option.
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
