import { useState, useMemo, useEffect, forwardRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, Trash2, Pencil, Check, X, MessageSquare, TrendingUp, TrendingDown, Minus, Database, ClipboardList, ShieldCheck, ShieldX, Clock, Lock } from "lucide-react";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { ForecastRecord } from "@/types/forecast";
import {
  getDayFromDate,
  calculateForecast,
  mergeWithActuals,
} from "@/utils/forecastUtils";
import { formatCurrency, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useForecastData } from "@/hooks/useForecastData";
import { useForecastPermissions } from "@/hooks/useForecastPermissions";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import ForecastCharts from "@/components/forecast/ForecastCharts";
import ForecastKPICards from "@/components/forecast/ForecastKPICards";
import DateFilter from "@/components/dashboard/DateFilter";
import { SalesRecord } from "@/types/sales";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

const ForecastInput = () => {
  const { venue } = useParams<{ venue: string }>();
  const venueName = venue === "caliente" ? "Caliente" : "Assembly";
  const { user } = useAuth();

  const { forecasts, loading: forecastsLoading, addForecast, updateForecast, deleteForecast, approveForecast, rejectForecast, approvePostEventNotes, rejectPostEventNotes } = useForecastData();
  const { canCreate, canApprove, canEditFigures, isApprover, loading: permLoading } = useForecastPermissions();
  const { isActionHidden } = usePagePermissions();

  const [salesData, setSalesData] = useState<SalesRecord[]>([]);
  const [showEntry, setShowEntry] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();

  const [date, setDate] = useState("");
  const [customers, setCustomers] = useState<number>(0);
  const [avgSpend, setAvgSpend] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [forecastNotes, setForecastNotes] = useState("");
  const [postEventNotes, setPostEventNotes] = useState("");

  // Load actuals from database
  useEffect(() => {
    import("@/utils/fetchAllRows").then(({ fetchAllRows }) => {
      fetchAllRows("sales_records", "*", { col: "date", asc: true }).then((data) => {
        if (data) {
          setSalesData(
            data.map((r: any) => ({
              date: r.date,
              day: r.day,
              venue: r.venue,
              reportNumber: r.report_number,
              orders: Number(r.orders),
              guests: Number(r.guests),
              subtotal: Number(r.subtotal),
              serviceCharge: Number(r.service_charge),
              discount: Number(r.discount),
              totalSales: Number(r.total_sales),
              visa: Number(r.visa),
              mastercard: Number(r.mastercard),
              amex: Number(r.amex),
              unionPay: Number(r.union_pay),
              jcb: Number(r.jcb),
              alipay: Number(r.alipay),
              wechat: Number(r.wechat),
              payme: Number(r.payme),
              cash: Number(r.cash),
              cardTips: Number(r.card_tips),
            }))
          );
        }
      });
    });
  }, []);

  const venueForecasts = useMemo(
    () => forecasts.filter((f) => f.venue === venueName).sort((a, b) => b.date.localeCompare(a.date)),
    [forecasts, venueName]
  );

  const venueSalesData = useMemo(
    () => salesData.filter((s) => s.venue === venueName),
    [salesData, venueName]
  );

  const forecastsWithActuals = useMemo(
    () => mergeWithActuals(venueForecasts, venueSalesData).sort((a, b) => b.date.localeCompare(a.date)),
    [venueForecasts, venueSalesData]
  );

  // Period filter
  const months = useMemo(() => {
    const allDates = forecastsWithActuals.map((d) => d.date);
    const keys = [...new Set(allDates.map((d) => getMonthKey(d)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [forecastsWithActuals]);

  const handlePeriodSelect = (period: string) => {
    if (period === "All Time") { setFrom(undefined); setTo(undefined); return; }
    if (period === "Custom") return;
    const month = months.find((m) => m.label === period);
    if (!month) return;
    const [y, m] = month.key.split("-");
    setFrom(new Date(parseInt(y), parseInt(m) - 1, 1));
    setTo(new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999));
  };

  const filteredData = useMemo(() => {
    return forecastsWithActuals.filter((d) => {
      const date = new Date(d.date);
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    });
  }, [forecastsWithActuals, from, to]);

  const preview = useMemo(() => calculateForecast(customers, avgSpend), [customers, avgSpend]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || customers <= 0 || !user) return;

    const calc = calculateForecast(customers, avgSpend);
    const success = await addForecast({
      date,
      day: getDayFromDate(date),
      venue: venueName as "Assembly" | "Caliente" | "Hanabi",
      forecastedCustomers: customers,
      forecastedAvgSpend: avgSpend,
      forecastedGrossSales: calc.grossSales,
      forecastedServiceCharge: calc.serviceCharge,
      forecastedTotalSales: calc.totalSales,
      comment,
      forecastNotes,
      postEventNotes,
      pendingPostEventNotes: null,
      status: "pending_approval",
      submittedBy: user.id,
    });

    if (success) {
      toast({ title: "Forecast submitted for approval" });
      setDate(""); setCustomers(0); setAvgSpend(0); setComment(""); setForecastNotes(""); setPostEventNotes("");
    } else {
      toast({ title: "Error adding forecast", variant: "destructive" });
    }
  };

  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ForecastRecord>>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    await deleteForecast(id);
    setDeleteTargetId(null);
  };

  const startEdit = (f: ForecastRecord) => {
    setEditId(f.id);
    setEditData({
      forecastedCustomers: f.forecastedCustomers,
      forecastedAvgSpend: f.forecastedAvgSpend,
      comment: f.comment,
      forecastNotes: f.forecastNotes,
      postEventNotes: f.postEventNotes,
    });
  };

  const cancelEdit = () => { setEditId(null); setEditData({}); };

  const saveEdit = async () => {
    if (!editId) return;
    const existing = forecasts.find((f) => f.id === editId);
    if (!existing) return;

    const updates: Partial<ForecastRecord> = {};

    if (isApprover) {
      // Approver can edit everything
      if (editData.forecastedCustomers !== undefined) updates.forecastedCustomers = editData.forecastedCustomers;
      if (editData.forecastedAvgSpend !== undefined) updates.forecastedAvgSpend = editData.forecastedAvgSpend;
      if (editData.forecastNotes !== undefined) updates.forecastNotes = editData.forecastNotes;
      if (editData.postEventNotes !== undefined) updates.postEventNotes = editData.postEventNotes;
      if (editData.comment !== undefined) updates.comment = editData.comment;
    } else if (existing.status === "approved") {
      // Non-approver on approved forecast: can only edit general comment freely
      // Post-event notes go to pending
      if (editData.comment !== undefined) updates.comment = editData.comment;
      if (editData.postEventNotes !== undefined && editData.postEventNotes !== existing.postEventNotes) {
        updates.pendingPostEventNotes = editData.postEventNotes;
      }
    } else {
      // Draft/pending: can edit everything
      if (editData.forecastedCustomers !== undefined) updates.forecastedCustomers = editData.forecastedCustomers;
      if (editData.forecastedAvgSpend !== undefined) updates.forecastedAvgSpend = editData.forecastedAvgSpend;
      if (editData.forecastNotes !== undefined) updates.forecastNotes = editData.forecastNotes;
      if (editData.postEventNotes !== undefined) updates.postEventNotes = editData.postEventNotes;
      if (editData.comment !== undefined) updates.comment = editData.comment;
    }

    const success = await updateForecast(editId, updates);
    if (success) {
      if (updates.pendingPostEventNotes) {
        toast({ title: "Post-event notes submitted for approval" });
      } else {
        toast({ title: "Forecast updated" });
      }
    }
    cancelEdit();
  };

  const handleApprove = async (id: string) => {
    if (!user) return;
    const success = await approveForecast(id, user.id);
    if (success) toast({ title: "Forecast approved" });
  };

  const handleReject = async (id: string) => {
    const success = await rejectForecast(id);
    if (success) toast({ title: "Forecast sent back to draft" });
  };

  const handleApprovePostNotes = async (id: string) => {
    const success = await approvePostEventNotes(id);
    if (success) toast({ title: "Post-event notes approved" });
  };

  const handleRejectPostNotes = async (id: string) => {
    const success = await rejectPostEventNotes(id);
    if (success) toast({ title: "Pending post-event notes rejected" });
  };

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case "approved":
        return <Badge variant="outline" className="text-emerald-600 border-emerald-600/30 bg-emerald-600/10 text-[10px]"><Lock className="h-2.5 w-2.5 mr-0.5" />Approved</Badge>;
      case "pending_approval":
        return <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />Pending</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground text-[10px]">Draft</Badge>;
    }
  };

  const VarianceIndicator = forwardRef<HTMLSpanElement, { value: number | null; suffix?: string }>(
    ({ value, suffix = "" }, ref) => {
      if (value === null) return <span ref={ref} className="text-muted-foreground text-xs">—</span>;
      if (value > 0) return <span ref={ref} className="text-emerald-600 text-xs font-medium flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />+{formatCurrency(value)}{suffix}</span>;
      if (value < 0) return <span ref={ref} className="text-red-500 text-xs font-medium flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{formatCurrency(value)}{suffix}</span>;
      return <span ref={ref} className="text-muted-foreground text-xs flex items-center gap-0.5"><Minus className="h-3 w-3" />0{suffix}</span>;
    }
  );
  VarianceIndicator.displayName = "VarianceIndicator";

  const hideNewEntry = isActionHidden("forecast.new_entry");
  const hideViewData = isActionHidden("forecast.view_data");
  const hideEditInputs = isActionHidden("forecast.edit_inputs");
  const hideEditNotes = isActionHidden("forecast.edit_notes");
  const hideEditPostEvent = isActionHidden("forecast.edit_post_event");
  const hideEditComment = isActionHidden("forecast.edit_comment");
  const hideDelete = isActionHidden("forecast.delete");
  const hideDateRange = isActionHidden("forecast.date_range");

  if (forecastsLoading || permLoading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">
            <span className="text-gradient-gold">{venueName}</span>
            <span className="text-muted-foreground ml-2 text-base font-normal">Forecast</span>
          </h1>
          {isApprover && (
            <p className="text-[10px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Approver Access
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <Link to="/forecast/assembly" className={`px-4 py-2 text-sm font-medium transition-colors ${venueName === "Assembly" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>Assembly</Link>
            <Link to="/forecast/caliente" className={`px-4 py-2 text-sm font-medium transition-colors ${venueName === "Caliente" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>Caliente</Link>
          </div>
          {canCreate && !hideNewEntry && (
            <button onClick={() => setShowEntry(!showEntry)} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${showEntry ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"}`}>
              <ClipboardList className="h-4 w-4" />New Entry
            </button>
          )}
          {!hideViewData && (
            <button onClick={() => setShowTable(!showTable)} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${showTable ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-secondary-foreground hover:bg-muted"}`}>
              <Database className="h-4 w-4" />View Data
            </button>
          )}
        </div>
      </div>

      {/* Period Filter */}
      {!hideDateRange && <DateFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} months={months.map((m) => m.label)} onPeriodSelect={handlePeriodSelect} />}

      {/* Input Form */}
      {showEntry && canCreate && (
        <div className="card-glass rounded-xl p-6 animate-fade-in">
          <h3 className="text-sm font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />New Forecast Entry
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" required />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Forecasted Customers</label>
                <input type="number" min={0} value={customers || ""} onChange={(e) => setCustomers(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" required />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Forecasted Avg Spend / Customer</label>
                <input type="number" min={0} value={avgSpend || ""} onChange={(e) => setAvgSpend(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" required />
              </div>
              <div className="flex flex-col justify-end">
                <div className="text-xs text-muted-foreground mb-1">Preview</div>
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm space-y-0.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Gross Sales</span><span className="font-medium">{formatCurrency(preview.grossSales)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">+ SC (10%)</span><span className="font-medium">{formatCurrency(preview.serviceCharge)}</span></div>
                  <div className="flex justify-between border-t border-border pt-0.5"><span className="text-muted-foreground font-semibold">Total Sales</span><span className="font-bold text-primary">{formatCurrency(preview.totalSales)}</span></div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Forecast Notes <span className="text-[10px] text-muted-foreground/70">(pre-event)</span></label>
                <textarea value={forecastNotes} onChange={(e) => setForecastNotes(e.target.value)} placeholder="e.g. Expected busy night due to live music event..." rows={2} className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Post-Event Notes <span className="text-[10px] text-muted-foreground/70">(after the event)</span></label>
                <textarea value={postEventNotes} onChange={(e) => setPostEventNotes(e.target.value)} placeholder="e.g. Rain reduced footfall..." rows={2} className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> General Comment</label>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Any other notes..." rows={1} className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground" />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity">Submit for Approval</button>
              <span className="text-[10px] text-muted-foreground">Forecast will be reviewed by an approver before it becomes active.</span>
            </div>
          </form>
        </div>
      )}

      {/* Data Table */}
      {showTable && (
        <div className="card-glass rounded-xl p-6 animate-fade-in">
          <h3 className="text-sm font-display font-semibold text-foreground mb-4">
            Forecast vs Actuals — {venueName} ({filteredData.length} records)
          </h3>
          {filteredData.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No forecasts yet for {venueName}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Date</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Day</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground" colSpan={3}>Customers</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground" colSpan={3}>Avg Spend</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground" colSpan={3}>Total Sales</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Comment</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Forecast Notes</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">Post-Event Notes</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                  <tr className="border-b border-border/50">
                    <th className="py-1 px-2" colSpan={3}></th>
                    {["Fcst", "Act", "Var", "Fcst", "Act", "Var", "Fcst", "Act", "Var"].map((h, i) => (
                      <th key={i} className="text-center py-1 px-2 text-[10px] text-muted-foreground font-medium">{h}</th>
                    ))}
                    <th className="py-1 px-2" colSpan={4}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((f) => {
                    const isEditing = editId === f.id;
                    const isForecastRow = !f.id.startsWith("actual-");
                    const isLocked = f.status === "approved" && !isApprover;
                    const canEditThisRow = isForecastRow && (isApprover || canEditFigures(f.status));

                    return (
                      <tr key={f.id} className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${f.status === "pending_approval" && canApprove ? "bg-amber-500/5" : ""}`}>
                        <td className="py-2.5 px-2 font-medium">{f.date}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{f.day}</td>
                        <td className="py-2.5 px-2">
                          {isForecastRow ? <StatusBadge status={f.status} /> : <span className="text-[10px] text-muted-foreground">Actual only</span>}
                          {f.pendingPostEventNotes && canApprove && (
                            <div className="mt-1">
                              <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-[9px]">
                                <Clock className="h-2 w-2 mr-0.5" />Pending Notes
                              </Badge>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {isEditing && canEditFigures(f.status) && !hideEditInputs ? (
                            <input type="number" value={editData.forecastedCustomers ?? 0} onChange={(e) => setEditData({ ...editData, forecastedCustomers: parseInt(e.target.value) || 0 })}
                              className="w-16 px-1 py-0.5 text-xs rounded border border-border bg-background text-foreground text-center" />
                          ) : f.forecastedCustomers || "—"}
                        </td>
                        <td className="py-2.5 px-2 text-center">{f.actualCustomers ?? "—"}</td>
                        <td className="py-2.5 px-2 text-center"><VarianceIndicator value={f.customerVariance} /></td>
                        <td className="py-2.5 px-2 text-center">
                          {isEditing && canEditFigures(f.status) && !hideEditInputs ? (
                            <input type="number" value={editData.forecastedAvgSpend ?? 0} onChange={(e) => setEditData({ ...editData, forecastedAvgSpend: parseInt(e.target.value) || 0 })}
                              className="w-16 px-1 py-0.5 text-xs rounded border border-border bg-background text-foreground text-center" />
                          ) : f.forecastedAvgSpend ? formatCurrency(f.forecastedAvgSpend) : "—"}
                        </td>
                        <td className="py-2.5 px-2 text-center">{f.actualAvgSpend !== null ? formatCurrency(f.actualAvgSpend) : "—"}</td>
                        <td className="py-2.5 px-2 text-center"><VarianceIndicator value={f.avgSpendVariance} /></td>
                        <td className="py-2.5 px-2 text-center font-semibold">{f.forecastedTotalSales ? formatCurrency(f.forecastedTotalSales) : "—"}</td>
                        <td className="py-2.5 px-2 text-center font-semibold">{f.actualTotalSales !== null ? formatCurrency(f.actualTotalSales) : "—"}</td>
                        <td className="py-2.5 px-2 text-center"><VarianceIndicator value={f.totalSalesVariance} /></td>
                        <td className="py-2.5 px-2 text-xs text-muted-foreground min-w-[180px] max-w-[250px]" title={f.comment}>
                          {isEditing && !hideEditComment ? (
                            <textarea value={editData.comment ?? ""} onChange={(e) => setEditData({ ...editData, comment: e.target.value })}
                              rows={3} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background text-foreground resize-y min-h-[60px]" placeholder="General comment..." />
                          ) : (
                            <span className="line-clamp-2">{f.comment || "—"}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-xs text-muted-foreground min-w-[180px] max-w-[250px]" title={f.forecastNotes}>
                          {isEditing && (isApprover || !isLocked) && !hideEditNotes ? (
                            <textarea value={editData.forecastNotes ?? ""} onChange={(e) => setEditData({ ...editData, forecastNotes: e.target.value })}
                              rows={3} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background text-foreground resize-y min-h-[60px]" placeholder="Pre-event notes..." />
                          ) : (
                            <span className="line-clamp-2">{f.forecastNotes || "—"}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-xs min-w-[180px] max-w-[250px]">
                          {isEditing && !hideEditPostEvent ? (
                            <div>
                              <textarea value={editData.postEventNotes ?? ""} onChange={(e) => setEditData({ ...editData, postEventNotes: e.target.value })}
                                rows={3} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background text-foreground resize-y min-h-[60px]" placeholder="Post-event notes..." />
                              {isLocked && <span className="text-[9px] text-amber-500 mt-1 block">Will need approval</span>}
                            </div>
                          ) : (
                            <div>
                              <span className="text-muted-foreground truncate block" title={f.postEventNotes}>{f.postEventNotes || "—"}</span>
                              {f.pendingPostEventNotes && (
                                <div className="mt-1 space-y-1">
                                  <span className="text-[9px] text-amber-500 block">Pending: {f.pendingPostEventNotes}</span>
                                  {canApprove && (
                                    <div className="flex gap-1">
                                      <button onClick={() => handleApprovePostNotes(f.id)} className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-600" title="Approve notes"><Check className="h-3 w-3" /></button>
                                      <button onClick={() => handleRejectPostNotes(f.id)} className="p-0.5 rounded hover:bg-red-500/20 text-red-500" title="Reject notes"><X className="h-3 w-3" /></button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          {isForecastRow && (
                            <div className="flex items-center gap-1">
                              {isEditing ? (
                                <>
                                  <button onClick={saveEdit} className="p-1 rounded hover:bg-secondary text-primary"><Check className="h-3.5 w-3.5" /></button>
                                  <button onClick={cancelEdit} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                                </>
                              ) : (
                                <>
                                  {/* Approve/Reject for approvers on pending forecasts */}
                                  {f.status === "pending_approval" && canApprove && (
                                    <>
                                      <button onClick={() => handleApprove(f.id)} className="p-1 rounded hover:bg-emerald-500/20 text-emerald-600" title="Approve"><ShieldCheck className="h-3.5 w-3.5" /></button>
                                      <button onClick={() => handleReject(f.id)} className="p-1 rounded hover:bg-red-500/20 text-red-500" title="Reject"><ShieldX className="h-3.5 w-3.5" /></button>
                                    </>
                                  )}
                                  {/* Edit - always available for approver, limited for others */}
                                  {(isApprover || !isLocked || f.status === "approved") && (
                                    <button onClick={() => startEdit(f)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title={isLocked ? "Edit comment & post-event notes" : "Edit"}><Pencil className="h-3.5 w-3.5" /></button>
                                  )}
                                  {/* Delete - admin only */}
                                  {isApprover && !hideDelete && (
                                    <button onClick={() => setDeleteTargetId(f.id)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* KPI Summary */}
      <ForecastKPICards data={filteredData} />

      {/* Charts */}
      <ForecastCharts data={filteredData} />

      <DeleteConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        onConfirm={() => { if (deleteTargetId) handleDelete(deleteTargetId); }}
        title="Delete Forecast Record"
        description="Are you sure you want to delete this forecast record? This action cannot be undone."
      />
    </div>
  );
};

export default ForecastInput;
