import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Pencil, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROUNDING_MODE_LABELS, type RoundingMode } from "@/utils/invoiceRounding";

export interface SupplierLike {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  payment_terms: string | null;
  invoice_rounding_mode: RoundingMode | null;
  is_active: boolean;
  created_at: string;
  categories: string[];
  delivery_days: string[];
  moq: number;
  account_number: string;
}

interface SupplierSheetProps {
  supplier: SupplierLike;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (supplier: SupplierLike) => void;
  onRefresh: () => void;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export default function SupplierSheet({ supplier, open, onOpenChange, onEdit, onRefresh }: SupplierSheetProps) {
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const [tab, setTab] = useState("profile");

  // Activity
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);

  // Financial
  const [finLoaded, setFinLoaded] = useState(false);
  const [thisMonthSpend, setThisMonthSpend] = useState(0);
  const [ytdSpend, setYtdSpend] = useState(0);
  const [openPayables, setOpenPayables] = useState(0);
  const [availableCredits, setAvailableCredits] = useState(0);

  // Reset when supplier changes
  useEffect(() => {
    setActivityLoaded(false);
    setFinLoaded(false);
    setTab("profile");
  }, [supplier.id]);

  useEffect(() => {
    if (!open || !tenantId) return;
    if (tab === "activity" && !activityLoaded) loadActivity();
    if (tab === "financial" && !finLoaded) loadFinancial();
  }, [tab, open, tenantId]);

  const loadActivity = async () => {
    const [{ data: inv }, { data: gr }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, venue, total_amount, payment_status, status")
        .eq("supplier_id", supplier.id)
        .eq("tenant_id", tenantId!)
        .order("invoice_date", { ascending: false })
        .limit(10),
      supabase
        .from("goods_received_notes")
        .select("id, grn_number, received_date, venue, status")
        .eq("supplier_id", supplier.id)
        .eq("tenant_id", tenantId!)
        .order("received_date", { ascending: false })
        .limit(5),
    ]);
    setInvoices(inv || []);
    setGrns(gr || []);
    setActivityLoaded(true);
  };

  const loadFinancial = async () => {
    const { data: grnItems } = await supabase
      .from("grn_items")
      .select("accepted_qty, unit_cost, goods_received_notes!grn_id(received_date, status, supplier_id)")
      .eq("tenant_id", tenantId!);

    const supplierGrns = (grnItems || []).filter(
      (g: any) =>
        g.goods_received_notes?.supplier_id === supplier.id &&
        g.goods_received_notes?.status === "confirmed",
    );

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const yearStart = `${now.getFullYear()}-01-01`;

    setThisMonthSpend(
      supplierGrns
        .filter((g: any) => g.goods_received_notes.received_date >= monthStart)
        .reduce((s: number, g: any) => s + Number(g.accepted_qty) * Number(g.unit_cost), 0),
    );
    setYtdSpend(
      supplierGrns
        .filter((g: any) => g.goods_received_notes.received_date >= yearStart)
        .reduce((s: number, g: any) => s + Number(g.accepted_qty) * Number(g.unit_cost), 0),
    );

    const { data: openInvoices } = await supabase
      .from("invoices")
      .select("total_amount, amount_paid")
      .eq("supplier_id", supplier.id)
      .eq("tenant_id", tenantId!)
      .neq("payment_status", "paid");

    setOpenPayables(
      (openInvoices || []).reduce(
        (s: number, i: any) => s + (Number(i.total_amount) - Number(i.amount_paid || 0)),
        0,
      ),
    );

    const { data: credits } = await supabase
      .from("credit_notes")
      .select("remaining_balance")
      .eq("supplier_id", supplier.id)
      .eq("tenant_id", tenantId!)
      .eq("status", "approved");

    setAvailableCredits((credits || []).reduce((s: number, c: any) => s + Number(c.remaining_balance), 0));
    setFinLoaded(true);
  };

  const statusBadge = (s: string | null | undefined) => {
    if (!s) return <Badge variant="secondary">—</Badge>;
    const v = s.toLowerCase();
    const variant: any =
      v === "paid" || v === "approved" || v === "confirmed"
        ? "default"
        : v === "disputed" || v === "overdue"
          ? "destructive"
          : "secondary";
    return <Badge variant={variant} className="text-[10px]">{s}</Badge>;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[700px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            {supplier.name}
            <Badge variant={supplier.is_active ? "default" : "secondary"}>
              {supplier.is_active ? "Active" : "Inactive"}
            </Badge>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-4 text-xs">
            {supplier.payment_terms && <span>Payment: {supplier.payment_terms}</span>}
            {supplier.moq > 0 && <span>MOQ: ${fmt(supplier.moq)}</span>}
            {supplier.account_number && <span>Acc: {supplier.account_number}</span>}
          </SheetDescription>
        </SheetHeader>

        <div className="flex gap-2 mt-4 mb-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(supplier)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit supplier
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
            <TabsTrigger value="financial" className="flex-1">Financial</TabsTrigger>
          </TabsList>

          {/* PROFILE */}
          <TabsContent value="profile" className="space-y-6 pt-4">
            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Contact</h4>
              <dl className="grid grid-cols-[140px_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Contact person</dt>
                <dd>{supplier.contact_person || "—"}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{supplier.email || "—"}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{supplier.phone || "—"}</dd>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{supplier.address || "—"}</dd>
              </dl>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Ordering</h4>
              <dl className="grid grid-cols-[140px_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Payment terms</dt>
                <dd>{supplier.payment_terms || "—"}</dd>
                <dt className="text-muted-foreground">Invoice rounding</dt>
                <dd>
                  {ROUNDING_MODE_LABELS[(supplier.invoice_rounding_mode || "sum_then_round") as RoundingMode]}
                </dd>
                <dt className="text-muted-foreground">MOQ</dt>
                <dd>{supplier.moq > 0 ? `$${fmt(supplier.moq)}` : "—"}</dd>
                <dt className="text-muted-foreground">Account number</dt>
                <dd>{supplier.account_number || "—"}</dd>
              </dl>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Categories</h4>
              {supplier.categories?.length ? (
                <div className="flex flex-wrap gap-2">
                  {supplier.categories.map((c) => (
                    <Badge key={c} variant="secondary">{c}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Delivery days</h4>
              {supplier.delivery_days?.length ? (
                <div className="flex gap-2">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => {
                    const on = supplier.delivery_days.includes(d);
                    return (
                      <div
                        key={d}
                        className={`flex items-center justify-center w-10 h-10 rounded-lg border text-xs font-medium ${
                          on
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground/40"
                        }`}
                      >
                        {d}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Notes</h4>
              <p className="text-sm whitespace-pre-wrap">{supplier.notes || "—"}</p>
            </section>

            <p className="text-xs text-muted-foreground">Member since: {fmtDate(supplier.created_at)}</p>
          </TabsContent>

          {/* ACTIVITY */}
          <TabsContent value="activity" className="space-y-6 pt-4">
            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Recent invoices</h4>
              {!activityLoaded ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Date</TableHead>
                      <TableHead className="h-8">Invoice #</TableHead>
                      <TableHead className="h-8">Venue</TableHead>
                      <TableHead className="h-8 text-right">Total</TableHead>
                      <TableHead className="h-8">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((i) => (
                      <TableRow key={i.id} className="text-xs">
                        <TableCell className="py-2">{fmtDate(i.invoice_date)}</TableCell>
                        <TableCell className="py-2 font-medium">{i.invoice_number || "—"}</TableCell>
                        <TableCell className="py-2">{i.venue || "—"}</TableCell>
                        <TableCell className="py-2 text-right tabular-nums">${fmt(i.total_amount)}</TableCell>
                        <TableCell className="py-2">{statusBadge(i.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Recent GRNs</h4>
              {!activityLoaded ? null : grns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No GRNs yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Date</TableHead>
                      <TableHead className="h-8">GRN #</TableHead>
                      <TableHead className="h-8">Venue</TableHead>
                      <TableHead className="h-8">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grns.map((g) => (
                      <TableRow key={g.id} className="text-xs">
                        <TableCell className="py-2">{fmtDate(g.received_date)}</TableCell>
                        <TableCell className="py-2 font-medium">{g.grn_number || "—"}</TableCell>
                        <TableCell className="py-2">{g.venue || "—"}</TableCell>
                        <TableCell className="py-2">{statusBadge(g.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <button
              onClick={() => navigate(`/procurement/invoices?supplier=${supplier.id}`)}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              View all invoices <ExternalLink className="h-3 w-3" />
            </button>
          </TabsContent>

          {/* FINANCIAL */}
          <TabsContent value="financial" className="space-y-4 pt-4">
            {!finLoaded ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">This month spend</div>
                    <div className="text-xl font-semibold tabular-nums mt-1">${fmt(thisMonthSpend)}</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">YTD spend</div>
                    <div className="text-xl font-semibold tabular-nums mt-1">${fmt(ytdSpend)}</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Open payables</div>
                    <div className="text-xl font-semibold tabular-nums mt-1 text-amber-500">
                      ${fmt(openPayables)}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Available credits</div>
                    <div className="text-xl font-semibold tabular-nums mt-1 text-emerald-500">
                      ${fmt(availableCredits)}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate("/finance/payables")}
                  className="text-xs text-muted-foreground hover:text-primary hover:underline inline-flex items-center gap-1"
                >
                  Full payables management available in Finance → Accounts Payable
                  <ExternalLink className="h-3 w-3" />
                </button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
