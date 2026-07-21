import { useEffect, useState, useCallback } from "react";
import { Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export interface SupplierAccountRow {
  id: string;
  account_number: string;
  label: string | null;
  default_venue_id: string | null;
  default_gl_account_id: string | null;
  is_active: boolean;
}

interface Props {
  supplierId: string;
  selectedAccountId: string | null;
  onSelect: (id: string | null) => void;
  /** Map of supplier_account_id -> count of linked bills */
  billCounts: Record<string, number>;
  onChanged?: () => void;
}

interface Venue { id: string; name: string }
interface Acct { id: string; code: string; name: string }

export default function SupplierAccountsSection({
  supplierId,
  selectedAccountId,
  onSelect,
  billCounts,
  onChanged,
}: Props) {
  const { tenantId } = useActiveTenant();
  const [rows, setRows] = useState<SupplierAccountRow[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [accts, setAccts] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    account_number: "",
    label: "",
    default_venue_id: "",
    default_gl_account_id: "",
    is_active: true,
  });

  const load = useCallback(async () => {
    if (!tenantId || !supplierId) return;
    setLoading(true);
    const [{ data: sa }, { data: v }, { data: a }] = await Promise.all([
      (supabase as any)
        .from("supplier_accounts")
        .select("id, account_number, label, default_venue_id, default_gl_account_id, is_active")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", supplierId)
        .order("account_number"),
      supabase.from("venues").select("id, name").eq("tenant_id", tenantId).order("sort_order"),
      (supabase as any)
        .from("chart_of_accounts")
        .select("id, code, name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("code"),
    ]);
    setRows((sa || []) as SupplierAccountRow[]);
    setVenues((v || []) as Venue[]);
    setAccts((a || []) as Acct[]);
    setLoading(false);
  }, [tenantId, supplierId]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () =>
    setForm({ account_number: "", label: "", default_venue_id: "", default_gl_account_id: "", is_active: true });

  const submit = async () => {
    if (!tenantId) return;
    const acct = form.account_number.trim();
    if (!acct) { toast.error("Account number is required"); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("supplier_accounts").insert({
      tenant_id: tenantId,
      supplier_id: supplierId,
      account_number: acct,
      label: form.label.trim() || null,
      default_venue_id: form.default_venue_id || null,
      default_gl_account_id: form.default_gl_account_id || null,
      is_active: form.is_active,
    });
    setSaving(false);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (error.code === "23505" || msg.includes("supplier_accounts_tenant_supplier_acct_uk") || msg.includes("duplicate")) {
        toast.error(`Account number "${acct}" already exists for this vendor.`);
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Account added");
    setOpen(false);
    resetForm();
    await load();
    onChanged?.();
  };

  const venueName = (id: string | null) => venues.find(x => x.id === id)?.name || null;
  const acctLabel = (id: string | null) => {
    const a = accts.find(x => x.id === id);
    return a ? `${a.code} · ${a.name}` : null;
  };

  return (
    <Card className="card-glass">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Accounts</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Multiple accounts under this vendor — click to filter bills below.
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => { resetForm(); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add account
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 border border-dashed border-border rounded-md text-center">
            No accounts yet. Add one to tag bills to a specific account number.
          </div>
        ) : (
          <div className="space-y-2">
            {/* "All accounts" row */}
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={`w-full flex items-center justify-between text-left rounded-md border px-3 py-2 transition-colors ${
                selectedAccountId === null
                  ? "border-primary/60 bg-primary/10"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                {selectedAccountId === null && <Check className="h-3.5 w-3.5 text-primary" />}
                <span className="font-medium">All accounts</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {Object.values(billCounts).reduce((a, b) => a + b, 0)} bills
              </span>
            </button>

            {rows.map((r) => {
              const selected = selectedAccountId === r.id;
              const count = billCounts[r.id] || 0;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                    selected ? "border-primary/60 bg-primary/10" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        <span className="font-mono text-sm font-medium">{r.account_number}</span>
                        {r.label && <span className="text-sm text-muted-foreground">· {r.label}</span>}
                        {!r.is_active && (
                          <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {venueName(r.default_venue_id) && <span>Venue: {venueName(r.default_venue_id)}</span>}
                        {acctLabel(r.default_gl_account_id) && <span>GL: {acctLabel(r.default_gl_account_id)}</span>}
                        {!venueName(r.default_venue_id) && !acctLabel(r.default_gl_account_id) && (
                          <span className="italic">No defaults set</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{count} bills</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add supplier account</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Account number *</Label>
                <Input
                  value={form.account_number}
                  onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                  placeholder="e.g. 82867-70477-2"
                  autoFocus
                />
              </div>
              <div>
                <Label>Label</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. G/F, 1F, 3F"
                />
              </div>
              <div>
                <Label>Default venue</Label>
                <Select
                  value={form.default_venue_id || "__none__"}
                  onValueChange={(v) => setForm({ ...form, default_venue_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {venues.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default GL account</Label>
                <Select
                  value={form.default_gl_account_id || "__none__"}
                  onValueChange={(v) => setForm({ ...form, default_gl_account_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {accts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(c) => setForm({ ...form, is_active: !!c })}
                />
                Active
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add account"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
