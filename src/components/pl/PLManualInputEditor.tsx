import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Edit2, Save, X } from "lucide-react";
import { toast } from "sonner";
import type { PLManualLine } from "@/hooks/usePLData";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

interface Props {
  onSave: () => void;
}

export function PLManualInputEditor({ onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<PLManualLine[]>([]);
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PLManualLine>>({});
  const [newLine, setNewLine] = useState({ line_item_name: "", amount: "", notes: "", year: currentYear, month: null as number | null });

  const fetchLines = async () => {
    let q = supabase.from("pl_manual_lines").select("*").eq("year", filterYear).order("line_item_name");
    if (filterMonth !== "all") q = q.eq("month", Number(filterMonth));
    const { data } = await q;
    if (data) setLines(data as PLManualLine[]);
  };

  useEffect(() => { if (open) fetchLines(); }, [open, filterYear, filterMonth]);

  const handleAdd = async () => {
    if (!newLine.line_item_name.trim()) { toast.error("Line item name required"); return; }
    const { error } = await supabase.from("pl_manual_lines").insert({
      year: newLine.year,
      month: newLine.month,
      line_item_name: newLine.line_item_name.trim(),
      amount: Number(newLine.amount) || 0,
      notes: newLine.notes,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Line added");
    setNewLine({ line_item_name: "", amount: "", notes: "", year: filterYear, month: null });
    fetchLines();
    onSave();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("pl_manual_lines").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    fetchLines();
    onSave();
  };

  const startEdit = (line: PLManualLine) => {
    setEditingId(line.id);
    setEditForm({ line_item_name: line.line_item_name, amount: line.amount, notes: line.notes, month: line.month });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("pl_manual_lines").update({
      line_item_name: editForm.line_item_name,
      amount: Number(editForm.amount) || 0,
      notes: editForm.notes || "",
      month: editForm.month,
    }).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    setEditingId(null);
    fetchLines();
    onSave();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Edit Manual Profit & Loss Inputs</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manual Profit & Loss Line Items</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 mb-4">
          <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-28"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line Item</TableHead>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map(line => (
              <TableRow key={line.id}>
                {editingId === line.id ? (
                  <>
                    <TableCell><Input value={editForm.line_item_name || ""} onChange={e => setEditForm(f => ({ ...f, line_item_name: e.target.value }))} /></TableCell>
                    <TableCell>
                      <Select value={editForm.month == null ? "annual" : String(editForm.month)} onValueChange={v => setEditForm(f => ({ ...f, month: v === "annual" ? null : Number(v) }))}>
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="annual">Annual</SelectItem>
                          {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input type="number" className="text-right" value={editForm.amount ?? ""} onChange={e => setEditForm(f => ({ ...f, amount: Number(e.target.value) }))} /></TableCell>
                    <TableCell><Input value={editForm.notes || ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} /></TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={handleSaveEdit}><Save className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-medium">{line.line_item_name}</TableCell>
                    <TableCell>{line.month ? MONTHS[line.month - 1] : "Annual"}</TableCell>
                    <TableCell className="text-right font-mono">{Number(line.amount).toLocaleString("en-HK", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{line.notes}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(line)}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(line.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {/* Add new row */}
            <TableRow>
              <TableCell><Input placeholder="Line item name" value={newLine.line_item_name} onChange={e => setNewLine(n => ({ ...n, line_item_name: e.target.value }))} /></TableCell>
              <TableCell>
                <Select value={newLine.month == null ? "annual" : String(newLine.month)} onValueChange={v => setNewLine(n => ({ ...n, month: v === "annual" ? null : Number(v) }))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell><Input type="number" className="text-right" placeholder="0.00" value={newLine.amount} onChange={e => setNewLine(n => ({ ...n, amount: e.target.value }))} /></TableCell>
              <TableCell><Input placeholder="Notes" value={newLine.notes} onChange={e => setNewLine(n => ({ ...n, notes: e.target.value }))} /></TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={handleAdd}><Plus className="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
