import { useState } from "react";
import { useBankModule } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TYPES = ["bank_fee", "kpay_settlement", "interest_income", "transfer", "supplier_payment", "customer_receipt", "expense", "tax", "payroll", "other"];

export default function BankRulesPage() {
  const { rules, coa, saveRule, deleteRule } = useBankModule();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);

  return (
    <BankPageShell
      title="Bank Rules"
      description="Description-based rules for auto-categorisation, auto-matching and recurring transactions."
      actions={<Button size="sm" onClick={() => { setEdit({ name: "", match_contains: "", suggested_type: "bank_fee", is_active: true, sort_order: rules.length }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New rule</Button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Total rules" value={rules.length} />
        <BankKpi label="Active" value={rules.filter((r: any) => r.is_active !== false).length} tone="success" />
        <BankKpi label="Inactive" value={rules.filter((r: any) => r.is_active === false).length} />
        <BankKpi label="Types covered" value={new Set(rules.map((r: any) => r.suggested_type)).size} />
      </div>

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-12">Order</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Match (contains)</TableHead>
            <TableHead>Suggested type</TableHead>
            <TableHead>Suggested category</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rules.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.sort_order ?? 0}</TableCell>
                <TableCell className="font-medium">{r.name || "(unnamed)"}</TableCell>
                <TableCell className="font-mono text-xs">{r.match_contains}</TableCell>
                <TableCell><Badge variant="secondary">{r.suggested_type}</Badge></TableCell>
                <TableCell>{coa.find((c) => c.id === r.suggested_category)?.code || r.suggested_category || "—"}</TableCell>
                <TableCell><Badge variant={r.is_active === false ? "outline" : "default"}>{r.is_active === false ? "Off" : "On"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => { setEdit(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={async () => { await deleteRule(r.id); toast.success("Deleted"); }}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {!rules.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No rules yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>{edit?.id ? "Edit rule" : "New rule"}</SheetTitle></SheetHeader>
          {edit && (
            <div className="py-4 space-y-3">
              <Field label="Name"><Input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Description contains (case-insensitive)">
                <Input value={edit.match_contains || ""} onChange={(e) => setEdit({ ...edit, match_contains: e.target.value })} />
              </Field>
              <Field label="Suggested type">
                <Select value={edit.suggested_type} onValueChange={(v) => setEdit({ ...edit, suggested_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Suggested category (optional)">
                <Select value={edit.suggested_category || ""} onValueChange={(v) => setEdit({ ...edit, suggested_category: v || null })}>
                  <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {coa.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sort order">
                <Input type="number" value={edit.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} />
              </Field>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={edit.is_active !== false} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} />
              </div>
            </div>
          )}
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              try { await saveRule(edit); toast.success("Saved"); setOpen(false); }
              catch (e: any) { toast.error(e.message); }
            }}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </BankPageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
