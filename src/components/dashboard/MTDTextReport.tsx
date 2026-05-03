import { useMemo, useCallback } from "react";
import { SalesRecord } from "@/types/sales";
import { formatCurrency } from "@/utils/salesUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

interface MTDTextReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SalesRecord[];
  from?: Date;
  to?: Date;
}

function generateMTDText(data: SalesRecord[], from?: Date, to?: Date): string {
  if (data.length === 0) return "No data available for the selected period.";

  const dates = data.map((r) => r.date).sort();
  const firstDate = from ? from : new Date(dates[0]);
  const lastTradingDate = new Date(dates[dates.length - 1]);
  const lastDate = to && to < lastTradingDate ? to : lastTradingDate;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthLabel = `${monthNames[firstDate.getMonth()]} ${firstDate.getFullYear()}`;

  // Format: (Oct 1, 2025 to Feb 3, 2026)
  const dateRange = `(${monthNames[firstDate.getMonth()]} ${firstDate.getDate()}, ${firstDate.getFullYear()} to ${monthNames[lastDate.getMonth()]} ${lastDate.getDate()}, ${lastDate.getFullYear()})`;

  const totalCalendarDays = Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const venueNames = [...new Set(data.map((r) => r.venue))].sort();

  const computeStats = (records: SalesRecord[]) => {
    const totalSales = records.reduce((s, r) => s + r.totalSales, 0);
    const totalGuests = records.reduce((s, r) => s + r.guests, 0);
    const totalDiscount = records.reduce((s, r) => s + r.discount, 0);
    const uniqueDays = new Set(records.map((r) => r.date)).size;
    const operatingDays = uniqueDays;
    const salesPerDay = operatingDays ? Math.round(totalSales / operatingDays) : 0;
    const guestsPerDay = operatingDays ? Math.round(totalGuests / operatingDays) : 0;
    const avgSpend = totalGuests ? Math.round(totalSales / totalGuests) : 0;
    const discountPct = totalSales ? ((Math.abs(totalDiscount) / totalSales) * 100).toFixed(1) : "0.0";
    return { totalSales, totalGuests, totalDiscount, operatingDays, salesPerDay, guestsPerDay, avgSpend, discountPct };
  };

  const lines: string[] = [];

  lines.push(`*${monthLabel} MTD*`);
  lines.push(`\`${dateRange}\``);

  // All Venues — inline backticks
  const allStats = computeStats(data);
  lines.push("");
  lines.push("*All Venues*");
  lines.push(`\`\`\`Sales: ${formatCurrency(allStats.totalSales)} (${formatCurrency(allStats.salesPerDay)}/day)`);
  lines.push(`Guests: ${formatCurrency(allStats.totalGuests)} (${formatCurrency(allStats.guestsPerDay)}/day)`);
  lines.push(`Avg Spend: ${formatCurrency(allStats.avgSpend)}/guest`);
  lines.push(`Discount: ${formatCurrency(Math.abs(allStats.totalDiscount))} (${allStats.discountPct}% of sales)\`\`\``);

  // Per venue — inline backticks
  venueNames.forEach((venueName) => {
    const venueRecords = data.filter((r) => r.venue === venueName);
    if (venueRecords.length === 0) return;
    const stats = computeStats(venueRecords);

    let venueHeader = `*${venueName}`;
    if (stats.operatingDays < totalCalendarDays) {
      venueHeader += ` (${stats.operatingDays} operating day${stats.operatingDays !== 1 ? "s" : ""})`;
    }
    venueHeader += "*";

    lines.push("");
    lines.push(venueHeader);
    lines.push(`\`\`\`Sales: ${formatCurrency(stats.totalSales)} (${formatCurrency(stats.salesPerDay)}/day)`);
    lines.push(`Guests: ${formatCurrency(stats.totalGuests)} (${formatCurrency(stats.guestsPerDay)}/day)`);
    lines.push(`Avg Spend: ${formatCurrency(stats.avgSpend)}/guest\`\`\``);
  });

  return lines.join("\n").trim();
}

const MTDTextReport = ({ open, onOpenChange, data, from, to }: MTDTextReportProps) => {
  const [copied, setCopied] = useState(false);
  const reportText = useMemo(() => generateMTDText(data, from, to), [data, from, to]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard!" });
      setTimeout(() => setCopied(false), 2000);
    });
  }, [reportText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>MTD Text Report</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </DialogTitle>
        </DialogHeader>
        <pre className="text-sm font-mono whitespace-pre-wrap bg-muted/50 rounded-lg p-4 border border-border leading-relaxed select-all">
          {reportText}
        </pre>
      </DialogContent>
    </Dialog>
  );
};

export default MTDTextReport;
