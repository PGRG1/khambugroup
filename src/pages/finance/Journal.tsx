import React, { useMemo, useState, useEffect } from "react";
import { useJournal, JournalLineDraft, JournalEntry, JournalLine } from "@/hooks/useJournal";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronRight, Ban, Pencil, RotateCcw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SOURCE_LABELS: Record<string, string> = {
  sales: "Sales",
  invoice: "Invoice",
  invoice_payment: "Payment",
  payroll_accrual: "Payroll Accrual",
  payroll_payment: "Salary Paid",
  mpf_payment: "MPF Paid",
  manual: "Manual",
  adjustment: "Adjustment",
  opening: "Opening",
};

export default function Journal() {
  const today = new Date();
  const defaultFrom = `${today.getFullYear()}-01-01`;
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState("");
  const [sourceType, setSourceType] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const { entries, lines, loading, createManualEntry, updateEntry, restoreAutoEntry, voidEntry, rebuildFromOperations } = useJournal({ fromDate: fromDate || undefined, toDate: toDate || undefined, sourceType });
  const { items: accounts } = useChartOfAccounts();

  const linesByEntry = useMemo(() => {
    const m = new Map<string, typeof lines>();
    lines.forEach((l) => {
      const arr = m.get(l.entry_id) || [];
      arr.push(l);
      m.set(l.entry_id, arr);
    });
    return m;
  }, [lines]);

  const toggle = (id: string) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  };

  const accName = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.code} — ${a.name}` : id.slice(0, 8);
  };

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Journal</h1>
          <p className="text-sm text-muted-foreground mt-1">All accounting entries — auto-generated and manual. Each entry is a balanced set of debits and credits. Click the pencil icon to edit any entry.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-40" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-40" />
          <Select value={sourceType} onValueChange={setSourceType}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <NewEntryDialog accounts={accounts} onSave={createManualEntry} />
          <Button variant="outline" size="sm" onClick={rebuildFromOperations}><RefreshCw className="h-4 w-4 mr-1" /> Rebuild</Button>
        </div>
      </header>

      <Card className="card-glass p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
            {!loading && entries.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No journal entries.</TableCell></TableRow>}
            {entries.map((e) => {
              const els = linesByEntry.get(e.id) || [];
              const totalDr = els.reduce((s, l) => s + Number(l.debit), 0);
              const totalCr = els.reduce((s, l) => s + Number(l.credit), 0);
              const isOpen = expanded.has(e.id);
              const canEdit = e.status === "posted";
              return (
                <React.Fragment key={e.id}>
                  <TableRow className={cn("cursor-pointer", e.status === "void" && "opacity-50")} onClick={() => toggle(e.id)}>
                    <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="font-mono text-xs">{e.entry_date}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{SOURCE_LABELS[e.source_type] || e.source_type}</span>
                        {e.manually_adjusted && e.source_type !== "manual" && (
                          <span title="Manually edited — will not be overwritten by Rebuild" className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 border border-amber-500/30">edited</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{e.memo}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(totalDr)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(totalCr)}</TableCell>
                    <TableCell><span className={cn("text-[10px] uppercase px-1.5 py-0.5 rounded", e.status === "posted" ? "bg-emerald-500/10 text-emerald-700" : e.status === "void" ? "bg-rose-500/10 text-rose-700" : "bg-amber-500/10 text-amber-700")}>{e.status}</span></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                        {canEdit && (
                          <button onClick={() => setEditingEntry(e)} title="Edit entry" className="p-1 text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                        )}
                        {e.manually_adjusted && e.source_type !== "manual" && (
                          <button onClick={() => restoreAutoEntry(e.id)} title="Re-attach to auto-rebuild (next Rebuild will replace this entry)" className="p-1 text-muted-foreground hover:text-primary"><RotateCcw className="h-3.5 w-3.5" /></button>
                        )}
                        {e.status === "posted" && e.source_type === "manual" && (
                          <button onClick={() => voidEntry(e.id)} title="Void entry" className="p-1 text-muted-foreground hover:text-destructive"><Ban className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && els.map((l) => {
                    const pm = (l as any).payment_method as string | null | undefined;
                    const ms = (l as any).mapping_status as string | null | undefined;
                    return (
                      <TableRow key={l.id} className="bg-muted/20">
                        <TableCell></TableCell>
                        <TableCell colSpan={2} className="pl-12 text-sm">
                          <div className="flex items-center gap-2">
                            <span>{accName(l.account_id)}</span>
                            {ms === "missing" && (
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700" title="Account mapping missing — set a mapping in Chart of Accounts → Mappings">
                                Missing mapping
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {l.memo}
                          {pm && <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{pm.replace(/_/g, " ")}</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(l.debit) ? fmt(Number(l.debit)) : ""}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(l.credit) ? fmt(Number(l.credit)) : ""}</TableCell>
                        <TableCell colSpan={2}></TableCell>
                      </TableRow>
                    );
                  })}

                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {editingEntry && (
        <EditEntryDialog
          entry={editingEntry}
          existingLines={linesByEntry.get(editingEntry.id) || []}
          accounts={accounts}
          onClose={() => setEditingEntry(null)}
          onSave={(input) => updateEntry(editingEntry.id, input, editingEntry.source_type)}
        />
      )}
    </div>
  );
}

function NewEntryDialog({ accounts, onSave }: { accounts: any[]; onSave: (i: { entry_date: string; memo: string; lines: JournalLineDraft[] }) => Promise<any> }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<JournalLineDraft[]>([
    { account_id: "", debit: 0, credit: 0 },
    { account_id: "", debit: 0, credit: 0 },
  ]);

  const totalDr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.round(totalDr * 100) === Math.round(totalCr * 100) && totalDr > 0;

  const update = (i: number, patch: Partial<JournalLineDraft>) => {
    const n = [...lines];
    n[i] = { ...n[i], ...patch };
    setLines(n);
  };

  const handleSave = async () => {
    const valid = lines.filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    const id = await onSave({ entry_date: date, memo, lines: valid });
    if (id) {
      setOpen(false);
      setLines([{ account_id: "", debit: 0, credit: 0 }, { account_id: "", debit: 0, credit: 0 }]);
      setMemo("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Entry</Button></DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>New Manual Journal Entry</DialogTitle></DialogHeader>
        <EntryLinesEditor
          accounts={accounts}
          date={date} setDate={setDate}
          memo={memo} setMemo={setMemo}
          lines={lines} setLines={setLines}
          totalDr={totalDr} totalCr={totalCr} balanced={balanced} update={update}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!balanced}>Post Entry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEntryDialog({
  entry, existingLines, accounts, onClose, onSave,
}: {
  entry: JournalEntry;
  existingLines: JournalLine[];
  accounts: any[];
  onClose: () => void;
  onSave: (i: { entry_date: string; memo: string; lines: JournalLineDraft[] }) => Promise<boolean>;
}) {
  const [date, setDate] = useState(entry.entry_date);
  const [memo, setMemo] = useState(entry.memo);
  const [lines, setLines] = useState<JournalLineDraft[]>(() =>
    existingLines.length > 0
      ? existingLines.map((l) => ({
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          memo: l.memo ?? "",
          venue: l.venue ?? undefined,
        }))
      : [{ account_id: "", debit: 0, credit: 0 }, { account_id: "", debit: 0, credit: 0 }]
  );

  const totalDr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.round(totalDr * 100) === Math.round(totalCr * 100) && totalDr > 0;

  const update = (i: number, patch: Partial<JournalLineDraft>) => {
    const n = [...lines];
    n[i] = { ...n[i], ...patch };
    setLines(n);
  };

  const handleSave = async () => {
    const valid = lines.filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    const ok = await onSave({ entry_date: date, memo, lines: valid });
    if (ok) onClose();
  };

  const isAuto = entry.source_type !== "manual";

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Journal Entry</DialogTitle>
        </DialogHeader>
        {isAuto && !entry.manually_adjusted && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Auto-generated entry ({SOURCE_LABELS[entry.source_type] || entry.source_type}).</strong> Saving will detach it from automatic rebuilds — future "Rebuild from operations" runs will not overwrite your changes. Use the restore icon on the row to re-attach later.
            </div>
          </div>
        )}
        {isAuto && entry.manually_adjusted && (
          <div className="text-xs text-muted-foreground">This entry has already been detached from auto-rebuild.</div>
        )}
        <EntryLinesEditor
          accounts={accounts}
          date={date} setDate={setDate}
          memo={memo} setMemo={setMemo}
          lines={lines} setLines={setLines}
          totalDr={totalDr} totalCr={totalCr} balanced={balanced} update={update}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!balanced}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntryLinesEditor({
  accounts, date, setDate, memo, setMemo, lines, setLines, totalDr, totalCr, balanced, update,
}: {
  accounts: any[];
  date: string; setDate: (v: string) => void;
  memo: string; setMemo: (v: string) => void;
  lines: JournalLineDraft[]; setLines: (v: JournalLineDraft[]) => void;
  totalDr: number; totalCr: number; balanced: boolean;
  update: (i: number, patch: Partial<JournalLineDraft>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div><label className="text-[11px] text-muted-foreground">Date</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" /></div>
        <div className="col-span-2"><label className="text-[11px] text-muted-foreground">Memo</label><Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Description…" className="h-9" /></div>
      </div>
      <div className="border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="text-right w-32">Debit</TableHead>
              <TableHead className="text-right w-32">Credit</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Select value={l.account_id || undefined} onValueChange={(v) => update(i, { account_id: v })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter((a) => a.is_active).map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Input value={l.memo ?? ""} onChange={(e) => update(i, { memo: e.target.value })} className="h-8" /></TableCell>
                <TableCell><Input type="number" step="0.01" value={l.debit || ""} onChange={(e) => update(i, { debit: parseFloat(e.target.value) || 0, credit: 0 })} className="h-8 text-right font-mono" /></TableCell>
                <TableCell><Input type="number" step="0.01" value={l.credit || ""} onChange={(e) => update(i, { credit: parseFloat(e.target.value) || 0, debit: 0 })} className="h-8 text-right font-mono" /></TableCell>
                <TableCell><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={2}><Button size="sm" variant="ghost" onClick={() => setLines([...lines, { account_id: "", debit: 0, credit: 0 }])}><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button></TableCell>
              <TableCell className="text-right font-mono font-semibold">{fmt(totalDr)}</TableCell>
              <TableCell className="text-right font-mono font-semibold">{fmt(totalCr)}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <div className={cn("text-sm font-medium", balanced ? "text-emerald-700" : "text-rose-700")}>
        {balanced ? "✓ Balanced" : `Out of balance by ${fmt(Math.abs(totalDr - totalCr))}`}
      </div>
    </div>
  );
}
