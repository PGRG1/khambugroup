import React, { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface CreatedSupplier {
  id: string;
  name: string;
  [key: string]: any;
}

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(160),
  code: z.string().trim().max(40),
  contact_person: z.string().trim().max(120),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(255).email("Enter a valid email address").or(z.literal("")),
  address: z.string().trim().max(300),
  payment_terms: z.string().trim().max(60),
  account_number: z.string().trim().max(100),
  notes: z.string().trim().max(1000),
});

const PAYMENT_TERMS = ["COD", "Net 7", "Net 14", "Net 30", "Net 60", "Due on presentation"];

const emptySupplier = {
  name: "", code: "", contact_person: "", phone: "", email: "", address: "",
  payment_terms: "COD", account_number: "", notes: "",
};

/** Same normalisation used by the scanner so duplicate detection agrees with matching. */
export const normalizeSupplierKey = (value: string) =>
  (value || "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\b(limited|ltd|co|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Authoritative supplier list, used for duplicate detection. */
  existingSuppliers: { id: string; name: string }[];
  /** Pre-fill (usually the scanned supplier wording). */
  defaultName?: string;
  onCreated: (supplier: CreatedSupplier) => void | Promise<void>;
}

export default function SupplierQuickCreateSheet({
  open, onOpenChange, existingSuppliers, defaultName, onCreated,
}: Props) {
  const { tenantId } = useActiveTenant();
  const isMobile = useIsMobile();
  const [form, setForm] = useState({ ...emptySupplier });
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (open) {
      setForm({ ...emptySupplier, name: (defaultName || "").trim() });
      setErrorText("");
    }
  }, [open, defaultName]);

  const update = (key: keyof typeof emptySupplier, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const duplicate = existingSuppliers.find(
    (supplier) => normalizeSupplierKey(supplier.name) === normalizeSupplierKey(form.name) && form.name.trim(),
  );

  const save = async () => {
    if (saving) return;
    const parsed = supplierSchema.safeParse(form);
    if (!parsed.success) { setErrorText(parsed.error.issues[0]?.message || "Check the supplier details."); return; }
    if (!tenantId) { setErrorText("No active workspace."); return; }
    if (duplicate) {
      // Never create a second record for the same normalized name — select the existing one.
      await onCreated(duplicate as CreatedSupplier);
      toast.success(`${duplicate.name} selected.`);
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setErrorText("");
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      vendor_type: "procurement",
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      payment_terms: form.payment_terms || null,
      account_number: form.account_number.trim(),
      notes: form.notes.trim() || null,
      is_active: true,
      tenant_id: tenantId,
      invoice_rounding_mode: "sum_then_round",
      categories: [],
      delivery_days: [],
      moq: 0,
    };
    const { data, error } = await supabase.from("suppliers").insert(payload as any).select("*").single();
    setSaving(false);
    if (error) { setErrorText(error.message); return; }
    const created = data as CreatedSupplier;
    await onCreated(created);
    toast.success(`${created.name} added.`);
    onOpenChange(false);
  };

  const field = (
    label: string,
    key: keyof typeof emptySupplier,
    options: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        {...options}
        value={form[key]}
        onChange={(event) => update(key, event.target.value)}
        className={cn("h-9 text-sm", options.className)}
      />
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-0 p-0", isMobile ? "h-[92vh] w-full rounded-t-2xl" : "w-full sm:max-w-[560px]")}
      >
        <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-4 w-4 text-primary" />
            <span>Add new supplier</span>
          </SheetTitle>
          <SheetDescription>Create the supplier record and use it on this invoice without leaving the scan.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {field("Supplier name *", "name", { placeholder: "Legal or trading name" })}
          {duplicate && (
            <Alert className="border-warning/40 bg-warning/10 py-2">
              <AlertDescription className="text-xs">
                {duplicate.name} already exists. Saving will select the existing supplier instead of creating a duplicate.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("Supplier code", "code", { className: "font-mono" })}
            {field("Account number", "account_number", { className: "font-mono" })}
            {field("Contact person", "contact_person")}
            {field("Phone", "phone")}
            {field("Email", "email", { type: "email" })}
            <div className="space-y-1.5">
              <Label className="text-xs">Payment terms</Label>
              <Select value={form.payment_terms} onValueChange={(value) => update("payment_terms", value)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select terms" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((term) => <SelectItem key={term} value={term}>{term}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address</Label>
            <Textarea value={form.address} onChange={(event) => update("address", event.target.value)} className="min-h-[64px] text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="min-h-[64px] text-sm" />
          </div>
          {errorText && (
            <Alert className="border-destructive/40 bg-destructive/10 py-2">
              <AlertDescription className="text-xs">{errorText}</AlertDescription>
            </Alert>
          )}
        </div>

        <SheetFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{duplicate ? "Use existing supplier" : "Create supplier"}</span>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
