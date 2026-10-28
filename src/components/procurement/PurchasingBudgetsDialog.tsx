import { useEffect, useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePurchasingBudgets, usePurchasingSalesForecast } from "@/hooks/usePurchasingBudgets";
import { previousCalendarMonth, suggestBudgets, hongKongDate, type BudgetChangeRow } from "@/utils/purchasingOverview";
import { formatCurrency as money, formatPercent as pct, formatTableInteger as integer } from "@/utils/format";
import { cn } from "@/lib/utils";

const monthKey = (date: Date) => format(date, "yyyy-MM");
const monthName = (key: string) => format(new Date(`${key}-01T12:00:00`), "MMMM");
const monthLabel = (key: string) => format(new Date(`${key}-01T12:00:00`), "MMM yyyy");
const changeLabel = (row: BudgetChangeRow) => {
  const when = format(new Date(`${hongKongDate(row.changed_at)}T12:00:00`), "d MMM");
  if (row.old_amount == null) return `Set ${when}`;
  return `${row.new_amount > row.old_amount ? "Raised" : "Lowered"} ${when}`;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** yyyy-MM of the month the page is showing. */
  defaultMonth: string;
  /** "Whole group · bought centrally" or the venue name. */
  scopeLabel: string;
  /** null = whole group (central buying). */
  venueId: string | null;
  isAdmin: boolean;
  /** Active budgetable level-1 category names. */
  categories: string[];
  /** Category spend for a month (yyyy-MM). */
  spendFor: (month: string) => Map<string, number>;
  /** Actual revenue for a month (yyyy-MM). */
  revenueFor: (month: string) => number;
  venueIds: string[];
}

export function PurchasingBudgetsDialog({ open, onOpenChange, defaultMonth, scopeLabel, venueId, isAdmin, categories, spendFor, revenueFor, venueIds }: Props) {
  const { budgets, changes, names, save } = usePurchasingBudgets();
  const [month, setMonth] = useState(defaultMonth);
  const forecastQuery = usePurchasingSalesForecast(month, venueIds, open);
  const forecast = forecastQuery.data?.forecast ?? null;
  const expectedSales = forecastQuery.data?.expected ?? 0;
  const actualSales = forecastQuery.data?.actual ?? 0;
  useEffect(() => { if (open) setMonth(defaultMonth); }, [open, defaultMonth]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [suggested, setSuggested] = useState<Map<string, number> | null>(null);
  const [reason, setReason] = useState("");
  const [historyCategory, setHistoryCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthOptions = useMemo(() => {
    const base = new Date(`${defaultMonth}-01T12:00:00`);
    return [0, 1, 2].map(n => monthKey(addMonths(base, n)));
  }, [defaultMonth]);

  const rowsFor = (key: string) => budgets.filter(row => row.venue_id === venueId && row.month.slice(0, 7) === key);
  const changesFor = (key: string, category?: string) => changes.filter(row => row.venue_id === venueId && row.month.slice(0, 7) === key && (!category || row.category === category));

  const currentAmounts = useMemo(() => {
    const map = new Map<string, number>();
    rowsFor(month).forEach(row => map.set(row.category, Number(row.amount)));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, month, venueId]);

  // (Re)initialise the inputs whenever the dialog opens or the month changes.
  useEffect(() => {
    if (!open) return;
    const base = new Map<string, number>();
    budgets.filter(row => row.venue_id === venueId && row.month.slice(0, 7) === month).forEach(row => base.set(row.category, Number(row.amount)));
    setSuggested(null);
    setAmounts(Object.fromEntries(categories.map(category => [category, base.has(category) ? String(base.get(category)) : ""])));
    setReason("");
    setHistoryCategory(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month, budgets, venueId, categories.join("|")]);

  const previous = previousCalendarMonth(month);
  const last3 = useMemo(() => {
    const keys = [0, 1, 2].map(n => monthKey(addMonths(new Date(`${month}-01T12:00:00`), -(n + 1))));
    const spend = keys.reduce((sum, key) => sum + [...spendFor(key).values()].reduce((a, b) => a + b, 0), 0);
    const revenue = keys.reduce((sum, key) => sum + revenueFor(key), 0);
    return { keys, spend, revenue, ratio: revenue > 0 ? spend / revenue * 100 : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, spendFor, revenueFor]);

  const parsed = (category: string) => {
    const raw = (amounts[category] ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const totalBudget = categories.reduce((sum, category) => sum + (parsed(category) ?? 0), 0);

  const copyPrevious = () => {
    if (!previous) return;
    const base = new Map<string, number>();
    rowsFor(previous).forEach(row => base.set(row.category, Number(row.amount)));
    setSuggested(null);
    setAmounts(Object.fromEntries(categories.map(category => [category, base.has(category) ? String(base.get(category)) : ""])));
  };

  const onSave = async () => {
    const next = new Map<string, number>();
    for (const category of categories) {
      const value = parsed(category);
      if (value != null) next.set(category, value);
    }
    if (categories.some(category => (amounts[category] ?? "").trim() && parsed(category) == null)) { toast.error("Enter a budget of 0 or more"); return; }
    setSaving(true);
    try {
      await save({ venueId, month, reason: reason.trim(), amounts: next });
      toast.success("Budgets saved");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save budgets");
    } finally {
      setSaving(false);
    }
  };

  const salesDifference = expectedSales > 0 ? actualSales / expectedSales - 1 : null;
  const suggestions = suggestBudgets(currentAmounts, actualSales, expectedSales);
  const suggestedTotal = [...suggestions.values()].reduce((sum, amount) => sum + amount, 0);
  const showSuggestion = isAdmin && month === hongKongDate().slice(0, 7) && salesDifference != null && Math.abs(salesDifference) >= 0.03;
  const useSuggestions = () => {
    setSuggested(suggestions);
    setAmounts(Object.fromEntries(categories.map(category => [category, suggestions.has(category) ? String(suggestions.get(category)) : amounts[category] ?? ""])));
  };
  const budgetInput = (category: string) => {
    const was = currentAmounts.get(category);
    const changed = suggested?.has(category) && Number(amounts[category]) !== was;
    return <div><Input type="number" min={0} step={100} inputMode="numeric" aria-label={`${category} budget`} className={cn("h-8 w-full text-right td-num", changed && "border-warning bg-warning/10")} value={amounts[category] ?? ""} disabled={!isAdmin} onChange={event => setAmounts(old => ({ ...old, [category]: event.target.value }))} />{changed && was != null && <p className="mt-0.5 text-right text-[11px] text-muted-foreground td-num">was {integer(was)}</p>}</div>;
  };
  const historyRows = historyCategory ? changesFor(month, historyCategory) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] max-h-[90svh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="text-left pr-8">
          <DialogTitle>{historyCategory ? `${historyCategory} history` : "Budgets"}</DialogTitle>
          <DialogDescription>{scopeLabel}</DialogDescription>
        </DialogHeader>
        {historyCategory ? (
          <div className="min-w-0">
            <Button variant="link" className="h-9 px-0 text-xs hover:text-foreground" onClick={() => setHistoryCategory(null)}><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Budgets</Button>
            <div className="max-h-[60svh] overflow-auto">
              {historyRows.length ? historyRows.map(row => {
                const change = row.old_amount != null && row.old_amount > 0 ? (row.new_amount - row.old_amount) / row.old_amount * 100 : null;
                return (
                  <div key={row.id} className="border-b border-border/40 last:border-0 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{names.get(row.changed_by ?? "") ?? "Someone"}</span>
                      <span className="text-xs text-muted-foreground break-words">{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(row.changed_at))}</span>
                    </div>
                    <div className="mt-1 td-num text-[13px]">
                      {row.old_amount == null ? "Not set" : money(row.old_amount)} → {money(row.new_amount)}
                      {change != null && <span className={cn("ml-2", change > 0 ? "text-warning" : "text-primary")}>{change >= 0 ? "+" : ""}{pct(change)}</span>}
                    </div>
                    {row.reason && <p className="mt-1 text-xs text-muted-foreground">{row.reason}</p>}
                  </div>
                );
              }) : <p className="py-8 text-sm text-muted-foreground">No changes yet.</p>}
            </div>
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{monthOptions.map(key => <SelectItem key={key} value={key}>{monthLabel(key)}</SelectItem>)}</SelectContent>
              </Select>

            </div>
            <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3 text-[13px]">
              <div className="rounded-lg border border-border/60 px-3 py-2"><p className="text-xs text-muted-foreground">Sales forecast</p><p className="td-num font-medium">{forecast != null ? money(forecast) : "—"}</p></div>
              <div className="rounded-lg border border-border/60 px-3 py-2"><p className="text-xs text-muted-foreground">Total budget{forecast ? ` (${pct(totalBudget / forecast * 100)} of forecast)` : ""}</p><p className="td-num font-medium">{money(totalBudget)}</p></div>
              <div className="rounded-lg border border-border/60 px-3 py-2"><p className="text-xs text-muted-foreground">Last 3 months spend as % of revenue</p><p className="td-num font-medium">{last3.ratio != null ? pct(last3.ratio) : "—"}</p></div>
            </div>
            {showSuggestion && salesDifference != null && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Sales are {pct(Math.abs(salesDifference * 100))} {salesDifference > 0 ? "above" : "below"} forecast. Suggested total: {money(suggestedTotal)}</span><Button variant="outline" size="sm" className="h-7" onClick={useSuggestions}>Use</Button></div>}
            <div className="sm:hidden max-h-[45svh] overflow-y-auto overflow-x-hidden divide-y divide-border/40">{categories.map(category => <div key={category} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3 py-3"><div className="min-w-0"><Button variant="link" className="h-auto max-w-full p-0 text-left text-[13px] whitespace-normal justify-start hover:text-foreground" onClick={() => setHistoryCategory(category)}>{category}</Button><p className="mt-1 text-[11px] text-muted-foreground">{previous ? `${monthName(previous)} ${integer(spendFor(previous).get(category) ?? 0)}` : ""}</p></div>{budgetInput(category)}</div>)}</div>
            <div className="hidden sm:block max-h-[50svh] overflow-y-auto overflow-x-hidden">
              <table className="w-full table-fixed text-[12px]">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-1 py-2 sm:px-2 text-left font-medium">Category</th>
                    {last3.keys.map(key => <th key={key} className="px-1 py-2 sm:px-2 text-right font-medium ">{monthLabel(key)}</th>)}
                    <th className="px-1 py-2 sm:px-2 text-right font-medium">Budget (HK$)</th>
                    <th className="px-1 py-2 sm:px-2 text-right font-medium">% of forecast</th>
                    <th className="px-1 py-2 sm:px-2 text-left font-medium">Last change</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(category => {
                    const categoryChanges = changesFor(month, category);
                    const last = categoryChanges[0];
                    const value = parsed(category);
                                        return (
                      <tr key={category} className="border-b border-border/40 last:border-0">
                        <td className="px-1 py-2 sm:px-2 font-medium">{category}</td>
                        {last3.keys.map(key => <td key={key} className="px-1 py-2 sm:px-2 text-right td-num whitespace-nowrap">{integer(spendFor(key).get(category) ?? 0)}</td>)}
                        <td className="px-1 py-2 sm:px-2 text-right">
                          {budgetInput(category)}
                        </td>
                        <td className="px-1 py-2 sm:px-2 text-right td-num whitespace-nowrap">{forecast && value != null ? pct(value / forecast * 100) : "—"}</td>
                        <td className="px-1 py-2 sm:px-2 text-xs text-muted-foreground break-words">
                          {last ? changeLabel(last) : "Not set"}
                          {categoryChanges.length > 1 && <Button variant="link" className="h-auto px-1 py-0 text-xs hover:text-foreground" onClick={() => setHistoryCategory(category)}>History</Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isAdmin && <Input aria-label="Note (optional)" placeholder="Note (optional)" value={reason} onChange={event => setReason(event.target.value)} className="h-9" />}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isAdmin && previous ? <Button variant="link" className="h-9 px-0 text-xs hover:text-foreground" onClick={copyPrevious}>Copy {monthName(previous)}</Button> : <span />}
              {isAdmin && <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Every change is saved with the date, time and who made it.</p>
      </DialogContent>
    </Dialog>
  );
}
