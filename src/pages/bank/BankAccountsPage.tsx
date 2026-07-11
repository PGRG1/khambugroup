import { useState, useMemo } from "react";
import { useBankModule, type BankAccount } from "@/hooks/useBankModule";
import { useOrganizations } from "@/hooks/useOrganizations";
import { useVenues } from "@/hooks/useVenues";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";

const CCYS = ["HKD", "USD", "CNY", "EUR", "GBP", "SGD", "JPY"];

export default function BankAccountsPage() {
  const { accounts, transactions, imports, coa, currentBalanceFor, ledgerBalanceFor, saveAccount, reload } = useBankModule();
  const { organizations } = useOrganizations();
  const { venues } = useVenues();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<BankAccount> | null>(null);
  const [delAccount, setDelAccount] = useState<BankAccount | null>(null);

  const orgVenues = useMemo(
    () => venues.filter((v) => edit?.organization_id && v.organization_id === edit.organization_id),
    [venues, edit?.organization_id],
  );
  const orgName = (id: string | null | undefined) =>
    organizations.find((o) => o.id === id)?.name ?? "—";
  const venueName = (id: string | null | undefined) =>
    venues.find((v) => v.id === id)?.name ?? null;

  const startAdd = () =>
    (setEdit({
      account_name: "", bank_name: "", account_number_last4: "", currency: "HKD",
      opening_balance: 0, opening_date: new Date().toISOString().slice(0, 10),
      is_active: true, notes: "", sort_order: 0,
      organization_id: organizations[0]?.id ?? null,
      venue_id: null,
    } as any), setOpen(true));

  const startEdit = (a: BankAccount) => (setEdit({ ...a }), setOpen(true));

  const save = async () => {
    if (!edit?.account_name || !edit.bank_name) {
      toast.error("Bank and account name are required"); return;
    }
    if (!edit.organization_id) {
      toast.error("Organization is required"); return;
    }
    try {
      await saveAccount(edit);
      toast.success("Saved");
      setOpen(false);
    } catch (e: any) { toast.error(e.message || "Failed"); }
  };

  const doDelete = async () => {
    if (!delAccount) return;
    const { error } = await supabase.from("bank_accounts").delete().eq("id", delAccount.id);
    if (error) {
      if (error.code === "23503" || (error.message || "").toLowerCase().includes("foreign key")) {
        toast.error("Cannot delete — this account has linked transactions. Remove those first.");
      } else {
        toast.error(error.message || "Failed to delete account");
      }
      setDelAccount(null);
      return;
    }
    toast.success("Account deleted");
    setDelAccount(null);
    await reload();
  };

  const totalCash = accounts.reduce((s, a) => s + currentBalanceFor(a.id), 0);

  return (
    <BankPageShell
      title="Bank Accounts"
      description="Multi-currency bank accounts and their current cash position."
      actions={<Button size="sm" onClick={startAdd}><Plus className="h-4 w-4 mr-1" />Add account</Button>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Active accounts" value={accounts.filter((a) => a.is_active).length} />
        <BankKpi label="Currencies" value={new Set(accounts.map((a) => a.currency)).size} />
        <BankKpi label="Total cash (mixed)" value={fmtMoney(totalCash)} tone="info" />
        <BankKpi label="Imports on record" value={imports.length} />
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bank</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Ref</TableHead>
              <TableHead>CCY</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Reconciled (GL)</TableHead>
              <TableHead>Last import</TableHead>
              <TableHead>Last recon</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => {
              const last = imports.find((i) => i.bank_account_id === a.id);
              return (
                <TableRow key={a.id}>
                  <TableCell>{a.bank_name}</TableCell>
                  <TableCell className="font-medium">{a.account_name}</TableCell>
                  <TableCell className="text-muted-foreground">{orgName(a.organization_id)}</TableCell>
                  <TableCell className="text-muted-foreground">{venueName(a.venue_id) ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">•••{a.account_number_last4}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell className="text-right font-mono td-num">{fmtMoney(a.opening_balance, a.currency)}</TableCell>
                  <TableCell className="text-right font-mono td-num">{fmtMoney(currentBalanceFor(a.id), a.currency)}</TableCell>
                  <TableCell className="text-right font-mono td-num">{fmtMoney(ledgerBalanceFor(a), a.currency)}</TableCell>
                  <TableCell>{last ? fmtDate(last.uploaded_at) : "—"}</TableCell>
                  <TableCell>{fmtDate(a.last_reconciled_date)}</TableCell>
                  <TableCell>
                    <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(a)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDelAccount(a)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!accounts.length && (
              <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">No bank accounts yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>{edit?.id ? "Edit account" : "Add bank account"}</SheetTitle></SheetHeader>
          {edit && (
            <div className="space-y-3 py-4">
              <Field label="Bank name">
                <Input value={edit.bank_name || ""} onChange={(e) => setEdit({ ...edit, bank_name: e.target.value })} />
              </Field>
              <Field label="Account name">
                <Input value={edit.account_name || ""} onChange={(e) => setEdit({ ...edit, account_name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Last 4 digits">
                  <Input maxLength={4} value={edit.account_number_last4 || ""} onChange={(e) => setEdit({ ...edit, account_number_last4: e.target.value.replace(/\D/g, "") })} />
                </Field>
                <Field label="Currency">
                  <Select value={edit.currency || "HKD"} onValueChange={(v) => setEdit({ ...edit, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CCYS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Opening balance">
                  <Input type="number" step="0.01" value={edit.opening_balance ?? 0} onChange={(e) => setEdit({ ...edit, opening_balance: Number(e.target.value) })} />
                </Field>
                <Field label="Opening date">
                  <Input type="date" value={edit.opening_date || ""} onChange={(e) => setEdit({ ...edit, opening_date: e.target.value })} />
                </Field>
              </div>
              <Field label="GL cash account (optional)">
                <Select value={edit.linked_gl_account_id || ""} onValueChange={(v) => setEdit({ ...edit, linked_gl_account_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
                  <SelectContent>
                    {coa.filter((c) => c.is_cash).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes">
                <Input value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              </Field>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={!!edit.is_active} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} />
              </div>
            </div>
          )}
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={!!delAccount}
        onOpenChange={(o) => !o && setDelAccount(null)}
        onConfirm={doDelete}
        title="Delete this account?"
        description="This action cannot be undone."
      />
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
