import { useEffect, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { Plus, Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { fmtDate } from "@/utils/format";

type ClientRow = { id: string; name: string; slug: string; status: string; created_at: string };

const COUNTRIES = ["Hong Kong","Singapore","Macau","United Kingdom","France","Nepal","India","Thailand","Vietnam","Other"];
const CURRENCIES = ["HKD","USD","EUR","GBP","SGD","MOP","INR","NPR","THB","VND"];
const TIMEZONES = ["Asia/Hong_Kong","Asia/Singapore","Asia/Macau","Europe/London","Europe/Paris","Asia/Kathmandu","Asia/Kolkata","Asia/Bangkok","Asia/Ho_Chi_Minh","UTC"];
const FY_OPTIONS = [
  { value: "01-01", label: "1 January (calendar year)" },
  { value: "04-01", label: "1 April" },
  { value: "07-01", label: "1 July" },
  { value: "10-01", label: "1 October" },
];

const STATUS_LABELS: Record<string, string> = {
  setup: "Setup",
  active: "Active",
  suspended: "Suspended",
};

export default function Clients() {
  const { isPlatformAdmin, loading: gateLoading } = usePlatformAdmin();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [venueCounts, setVenueCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("tenants")
      .select("id, name, slug, status, created_at")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as ClientRow[]);
    if (data && data.length) {
      const { data: vs } = await supabase
        .from("venues")
        .select("tenant_id")
        .in("tenant_id", data.map((d: any) => d.id));
      const counts: Record<string, number> = {};
      (vs ?? []).forEach((v: any) => { counts[v.tenant_id] = (counts[v.tenant_id] || 0) + 1; });
      setVenueCounts(counts);
    }
  }, []);

  useEffect(() => { if (isPlatformAdmin) refresh(); }, [isPlatformAdmin, refresh]);

  if (gateLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bani client groups provisioned on the platform.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Client
        </Button>
      </div>

      <div className="card-glass rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Client Group</th>
              <th className="text-left px-4 py-2.5 font-medium">Venues</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-left px-4 py-2.5 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {rows?.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No clients yet.</td></tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">/{r.slug}</span>
                  </div>
                </td>
                <td className="px-4 py-3 td-num">{venueCounts[r.id] ?? 0}</td>
                <td className="px-4 py-3">
                  <span className={`chip ${r.status === "active" ? "chip-success" : r.status === "setup" ? "chip-warn" : "chip-neutral"}`}>
                    <span className="dot" />{STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground td-num">{fmtDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddClientDialog open={open} onOpenChange={setOpen} onCreated={refresh} />
    </div>
  );
}

function AddClientDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    client_group_name: "",
    legal_entity_name: "",
    country: "Hong Kong",
    base_currency: "HKD",
    timezone: "Asia/Hong_Kong",
    financial_year_start: "04-01",
    initial_venue_name: "",
    admin_name: "",
    admin_email: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = Object.values(form).every((v) => String(v).trim().length > 0)
    && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.admin_email);

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("provision-tenant", { body: form });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Client created", description: `${form.client_group_name} is ready.` });
      onOpenChange(false);
      setForm({
        client_group_name: "", legal_entity_name: "", country: "Hong Kong",
        base_currency: "HKD", timezone: "Asia/Hong_Kong", financial_year_start: "04-01",
        initial_venue_name: "", admin_name: "", admin_email: "",
      });
      onCreated();
    } catch (e: any) {
      toast({ title: "Provisioning failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Client</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <Field label="Client group name">
            <Input value={form.client_group_name} onChange={(e) => set("client_group_name")(e.target.value)} />
          </Field>
          <Field label="Legal entity name">
            <Input value={form.legal_entity_name} onChange={(e) => set("legal_entity_name")(e.target.value)} />
          </Field>
          <Field label="Country">
            <Select value={form.country} onValueChange={set("country")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Base currency">
            <Select value={form.base_currency} onValueChange={set("base_currency")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Timezone">
            <Select value={form.timezone} onValueChange={set("timezone")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEZONES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Financial year start">
            <Select value={form.financial_year_start} onValueChange={set("financial_year_start")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Initial venue name">
            <Input value={form.initial_venue_name} onChange={(e) => set("initial_venue_name")(e.target.value)} />
          </Field>
          <div className="hidden sm:block" />
          <Field label="Client administrator name">
            <Input value={form.admin_name} onChange={(e) => set("admin_name")(e.target.value)} />
          </Field>
          <Field label="Client administrator email">
            <Input type="email" value={form.admin_email} onChange={(e) => set("admin_email")(e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
