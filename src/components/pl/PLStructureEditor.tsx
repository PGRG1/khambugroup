import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowUp, ArrowDown, Sigma, Type, Heading, Minus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import type { PLStructureRow, PLRowKind } from "@/hooks/usePLStructure";

interface Props {
  rows: PLStructureRow[];
  onChanged: () => void;
}

const KIND_META: Record<PLRowKind, { label: string; icon: any; hint: string }> = {
  section: { label: "Section header", icon: Heading, hint: "Bold heading (e.g. Operating Expenses)" },
  item:    { label: "Line item",      icon: Type,    hint: "Manual amount you can edit each month" },
  sum:     { label: "Sum line",       icon: Sigma,   hint: "Auto-totals the items above it" },
  spacer:  { label: "Spacer",         icon: Minus,   hint: "Empty divider row" },
};

export function PLStructureEditor({ rows, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<PLStructureRow[]>(rows);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(rows); }, [rows, open]);

  const update = (id: string, patch: Partial<PLStructureRow>) =>
    setLocal(l => l.map(r => r.id === id ? { ...r, ...patch } : r));

  const removeRow = (id: string) =>
    setLocal(l => l.filter(r => r.id !== id));

  const move = (id: string, dir: -1 | 1) => {
    setLocal(l => {
      const idx = l.findIndex(r => r.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= l.length) return l;
      const copy = [...l];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  };

  const insertAfter = (id: string | null, kind: PLRowKind) => {
    const newRow: PLStructureRow = {
      id: `tmp-${crypto.randomUUID()}`,
      kind,
      label: kind === "spacer" ? "" : kind === "section" ? "New Section" : kind === "sum" ? "Total" : "New Line",
      sort_order: 0,
      indent: kind === "section" ? 0 : 1,
      is_bold: false,
    };
    setLocal(l => {
      if (id === null) return [...l, newRow];
      const idx = l.findIndex(r => r.id === id);
      const copy = [...l];
      copy.splice(idx + 1, 0, newRow);
      return copy;
    });
  };

  const handleSave = async () => {
    // Validate
    for (const r of local) {
      if (r.kind !== "spacer" && !r.label.trim()) {
        toast.error("All non-spacer rows need a label");
        return;
      }
    }
    setSaving(true);

    // Diff: delete rows that were removed
    const originalIds = new Set(rows.map(r => r.id));
    const localIds = new Set(local.map(r => r.id).filter(id => !id.startsWith("tmp-")));
    const toDelete = [...originalIds].filter(id => !localIds.has(id));

    if (toDelete.length > 0) {
      const { error } = await supabase.from("pl_structure_rows").delete().in("id", toDelete);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    // Upsert all current rows with fresh sort_order
    const payload = local.map((r, i) => ({
      ...(r.id.startsWith("tmp-") ? {} : { id: r.id }),
      kind: r.kind,
      label: r.label.trim(),
      sort_order: (i + 1) * 10,
      indent: r.indent,
      is_bold: r.is_bold,
    }));

    const { error } = await supabase.from("pl_structure_rows").upsert(payload as any);
    if (error) { toast.error(error.message); setSaving(false); return; }

    toast.success("P&L structure saved");
    setSaving(false);
    setOpen(false);
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="h-4 w-4" /> Edit P&L Structure
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Profit & Loss Structure</DialogTitle>
          <DialogDescription>
            Reorder, rename, add, or remove rows. <b>Sum</b> lines auto-total the items above them up to the previous Sum or Section. Saved structure applies to every period.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap mb-3">
          {(Object.keys(KIND_META) as PLRowKind[]).map(k => {
            const Icon = KIND_META[k].icon;
            return (
              <Button key={k} variant="outline" size="sm" className="gap-1.5" onClick={() => insertAfter(null, k)}>
                <Plus className="h-3 w-3" /> <Icon className="h-3.5 w-3.5" /> {KIND_META[k].label}
              </Button>
            );
          })}
        </div>

        <div className="border border-border rounded-md divide-y divide-border bg-card">
          {local.map((r) => {
            const Icon = KIND_META[r.kind].icon;
            return (
              <div key={r.id} className="flex items-center gap-2 px-2 py-1.5">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Select value={r.kind} onValueChange={(v: PLRowKind) => update(r.id, { kind: v })}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_META) as PLRowKind[]).map(k => (
                      <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {r.kind === "spacer" ? (
                  <div className="flex-1 text-xs text-muted-foreground italic">— blank row —</div>
                ) : (
                  <Input
                    value={r.label}
                    onChange={e => update(r.id, { label: e.target.value })}
                    className="flex-1 h-8 text-sm"
                    placeholder="Label"
                  />
                )}

                <Select value={String(r.indent)} onValueChange={(v) => update(r.id, { indent: Number(v) })}>
                  <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Indent 0</SelectItem>
                    <SelectItem value="1">Indent 1</SelectItem>
                    <SelectItem value="2">Indent 2</SelectItem>
                  </SelectContent>
                </Select>

                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(r.id, -1)} title="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(r.id, 1)} title="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => insertAfter(r.id, "item")} title="Insert item below">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeRow(r.id)} title="Remove row">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
          {local.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No rows yet — add one above.</div>
          )}
        </div>

        <div className="flex justify-between items-center mt-4">
          <p className="text-xs text-muted-foreground">
            Removing a <b>line item</b> only removes it from the layout — its historical amounts in the manual inputs are untouched.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save structure"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
