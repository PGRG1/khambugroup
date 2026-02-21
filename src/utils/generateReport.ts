import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getVenueComparison } from "@/utils/salesUtils";

interface ReportOptions {
  data: SalesRecord[];
  venue: "All Venues" | "Assembly" | "Caliente" | "Hanabi";
  monthLabel: string;
}

// Institutional palette — inspired by Goldman Sachs / McKinsey
const NAVY = [10, 30, 68] as const;
const GOLD_ACCENT = [163, 138, 92] as const;
const DARK_TEXT = [20, 20, 30] as const;
const BODY_TEXT = [60, 60, 70] as const;
const LABEL_TEXT = [110, 110, 120] as const;
const GRID_LINE = [220, 220, 225] as const;
const CARD_BG = [248, 248, 250] as const;
const WHITE = [255, 255, 255] as const;

const CHART_COLORS = {
  sales: [163, 138, 92],       // gold
  guests: [46, 130, 135],      // teal
  spendGuest: [190, 110, 50],  // warm amber
  spendOrder: [140, 70, 55],   // rust
} as const;

const VENUE_COLORS = {
  assembly: [190, 110, 50] as readonly [number, number, number],
  caliente: [60, 100, 160] as readonly [number, number, number],
};

let exhibitCounter = 0;

// ── Nice Y-axis ticks ──
function niceScale(maxVal: number, tickCount = 5): number[] {
  if (maxVal <= 0) return [0];
  const rough = maxVal / (tickCount - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  let niceStep: number;
  if (residual <= 1) niceStep = mag;
  else if (residual <= 2) niceStep = 2 * mag;
  else if (residual <= 5) niceStep = 5 * mag;
  else niceStep = 10 * mag;

  const ticks: number[] = [];
  for (let v = 0; v <= maxVal + niceStep * 0.5; v += niceStep) {
    ticks.push(Math.round(v));
    if (ticks.length >= tickCount + 1) break;
  }
  return ticks;
}

function formatAxisLabel(val: number, prefix = ""): string {
  if (val >= 1000000) return `${prefix}${(val / 1000000).toFixed(1)}M`;
  if (val >= 10000) return `${prefix}${(val / 1000).toFixed(0)}k`;
  if (val >= 1000) return `${prefix}${(val / 1000).toFixed(1)}k`;
  return `${prefix}${formatCurrency(val)}`;
}

type DailyAgg = { date: string; day: string; sales: number; guests: number; orders: number };

function buildDailyData(records: SalesRecord[]): DailyAgg[] {
  const map = new Map<string, DailyAgg>();
  records.forEach((r) => {
    const existing = map.get(r.date);
    if (existing) {
      existing.sales += r.totalSales;
      existing.guests += r.guests;
      existing.orders += r.orders;
    } else {
      map.set(r.date, { date: r.date, day: r.day, sales: r.totalSales, guests: r.guests, orders: r.orders });
    }
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function formatDateShort(date: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parts = date.split("-");
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${parseInt(parts[2], 10)}-${months[monthIdx]}`;
}

interface ChartPoint { label: string; value: number; }

export function generateMTDReport({ data, venue, monthLabel }: ReportOptions) {
  exhibitCounter = 0;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const addNewPageIfNeeded = (requiredSpace: number) => {
    if (y + requiredSpace > pageHeight - 22) {
      doc.addPage();
      y = 22;
    }
  };

  // ── HEADER ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 36, "F");
  // Thin gold rule
  doc.setFillColor(...GOLD_ACCENT);
  doc.rect(0, 36, pageWidth, 0.8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...WHITE);
  doc.text("KHAMBU GROUP", margin, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 210);
  doc.text("Revenue Report", margin, 23);

  doc.setFontSize(8);
  doc.setTextColor(170, 170, 185);
  doc.text(`Period: ${monthLabel}`, pageWidth - margin, 13, { align: "right" });
  doc.text(venue === "All Venues" ? "All Venues" : venue, pageWidth - margin, 19, { align: "right" });
  doc.text("Prepared by 77Nexus", pageWidth - margin, 25, { align: "right" });

  y = 45;

  // ── KPI SUMMARY ──
  const totalSales = data.reduce((s, r) => s + r.totalSales, 0);
  const totalGuests = data.reduce((s, r) => s + r.guests, 0);
  const totalOrders = data.reduce((s, r) => s + r.orders, 0);
  const totalDiscount = data.reduce((s, r) => s + r.discount, 0);
  const avgPerGuest = totalGuests ? Math.round(totalSales / totalGuests) : 0;
  const avgPerOrder = totalOrders ? Math.round(totalSales / totalOrders) : 0;
  const daysCount = new Set(data.map(r => r.date)).size;
  const avgDailySales = daysCount ? Math.round(totalSales / daysCount) : 0;

  drawSectionTitle(doc, "Performance Summary", margin, y);
  y += 10;

  const kpis = [
    { label: "TOTAL SALES", value: `$${formatCurrency(totalSales)}` },
    { label: "TOTAL GUESTS", value: formatCurrency(totalGuests) },
    { label: "TOTAL ORDERS", value: formatCurrency(totalOrders) },
    { label: "AVG / GUEST", value: `$${formatCurrency(avgPerGuest)}` },
    { label: "AVG / ORDER", value: `$${formatCurrency(avgPerOrder)}` },
    { label: "AVG DAILY SALES", value: `$${formatCurrency(avgDailySales)}` },
    { label: "TOTAL DISCOUNT", value: `$${formatCurrency(Math.abs(totalDiscount))}` },
    { label: "TRADING DAYS", value: String(daysCount) },
  ];

  const cardWidth = (contentWidth - 6) / 4;
  const cardHeight = 18;
  const cardGap = 2;

  kpis.forEach((kpi, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx = margin + col * (cardWidth + cardGap);
    const cy = y + row * (cardHeight + cardGap);

    doc.setFillColor(...CARD_BG);
    doc.roundedRect(cx, cy, cardWidth, cardHeight, 1.5, 1.5, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...LABEL_TEXT);
    doc.text(kpi.label, cx + 4, cy + 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK_TEXT);
    doc.text(kpi.value, cx + 4, cy + 14);
  });

  y += Math.ceil(kpis.length / 4) * (cardHeight + cardGap) + 8;

  // ── VENUE COMPARISON ──
  if (venue === "All Venues") {
    addNewPageIfNeeded(50);
    const venueComp = getVenueComparison(data);

    drawSectionTitle(doc, "Venue Comparison", margin, y);
    y += 10;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Metric", "Assembly", "Caliente"]],
      body: [
        ["Total Sales", `$${formatCurrency(venueComp[0]?.totalSales || 0)}`, `$${formatCurrency(venueComp[1]?.totalSales || 0)}`],
        ["Total Guests", formatCurrency(venueComp[0]?.totalGuests || 0), formatCurrency(venueComp[1]?.totalGuests || 0)],
        ["Total Orders", formatCurrency(venueComp[0]?.totalOrders || 0), formatCurrency(venueComp[1]?.totalOrders || 0)],
        ["Avg / Guest", `$${formatCurrency(venueComp[0]?.avgPerGuest || 0)}`, `$${formatCurrency(venueComp[1]?.avgPerGuest || 0)}`],
        ["Avg / Order", `$${formatCurrency(venueComp[0]?.avgPerOrder || 0)}`, `$${formatCurrency(venueComp[1]?.avgPerOrder || 0)}`],
        ["Trading Days", String(venueComp[0]?.days || 0), String(venueComp[1]?.days || 0)],
      ],
      headStyles: { fillColor: NAVY as any, textColor: [...WHITE], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: DARK_TEXT as any },
      alternateRowStyles: { fillColor: [248, 248, 250] },
      styles: { cellPadding: 3, lineColor: [230, 230, 235], lineWidth: 0.2 },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── CHART DATA ──
  const combinedDaily = buildDailyData(data);
  const assemblyDaily = buildDailyData(data.filter(r => r.venue === "Assembly"));
  const calienteDaily = buildDailyData(data.filter(r => r.venue === "Caliente"));

  const halfWidth = (contentWidth - 4) / 2;
  const smallChartH = 48;
  const fullChartH = 60;

  // ── CHART SECTIONS ──
  const chartSections = [
    {
      title: "Daily Sales",
      type: "bar" as const,
      getData: (d: DailyAgg[]) => d.map(r => ({ label: formatDateShort(r.date), value: r.sales })),
      color: CHART_COLORS.sales,
      prefix: "$",
    },
    {
      title: "Daily Number of Customers",
      type: "line" as const,
      getData: (d: DailyAgg[]) => d.map(r => ({ label: formatDateShort(r.date), value: r.guests })),
      color: CHART_COLORS.guests,
      prefix: "",
    },
    {
      title: "Average Spend Per Customer",
      type: "bar" as const,
      getData: (d: DailyAgg[]) => d.map(r => ({ label: formatDateShort(r.date), value: r.guests ? Math.round(r.sales / r.guests) : 0 })),
      color: CHART_COLORS.spendGuest,
      prefix: "$",
    },
    {
      title: "Average Spend Per Order",
      type: "bar" as const,
      getData: (d: DailyAgg[]) => d.map(r => ({ label: formatDateShort(r.date), value: r.orders ? Math.round(r.sales / r.orders) : 0 })),
      color: CHART_COLORS.spendOrder,
      prefix: "$",
    },
  ];

  for (const section of chartSections) {
    const drawFn = section.type === "line" ? drawLineChart : drawBarChart;

    addNewPageIfNeeded(fullChartH + smallChartH + 35);
    exhibitCounter++;
    drawExhibitTitle(doc, `Exhibit ${exhibitCounter}: ${section.title}`, margin, y);
    y += 8;

    drawFn(doc, section.getData(combinedDaily), margin, y, contentWidth, fullChartH, section.color, section.prefix, "Combined");
    y += fullChartH + 4;

    addNewPageIfNeeded(smallChartH + 12);
    drawFn(doc, section.getData(assemblyDaily), margin, y, halfWidth, smallChartH, VENUE_COLORS.assembly, section.prefix, "Assembly");
    drawFn(doc, section.getData(calienteDaily), margin + halfWidth + 4, y, halfWidth, smallChartH, VENUE_COLORS.caliente, section.prefix, "Caliente");
    y += smallChartH + 14;
  }

  // ── FOOTERS ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Thin top rule on subsequent pages
    if (i > 1) {
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.4);
      doc.line(margin, 10, pageWidth - margin, 10);
      doc.setFontSize(6.5);
      doc.setTextColor(...LABEL_TEXT);
      doc.text("Khambu Group — Revenue Report", margin, 8);
      doc.text(monthLabel, pageWidth - margin, 8, { align: "right" });
    }
    // Footer
    doc.setDrawColor(...GRID_LINE);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFontSize(6.5);
    doc.setTextColor(...LABEL_TEXT);
    doc.text("Khambu Group — Confidential", margin, pageHeight - 8);
    doc.text(`${i}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  const fileName = `Khambu_Revenue_Report_${venue.replace(/\s/g, "_")}_${monthLabel.replace(/\s/g, "_")}.pdf`;
  doc.save(fileName);
}

// ── Section Title ──
function drawSectionTitle(doc: jsPDF, title: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(title, x, y);
  doc.setDrawColor(...GOLD_ACCENT);
  doc.setLineWidth(0.5);
  doc.line(x, y + 2, x + 20, y + 2);
}

// ── Exhibit Title (Goldman style) ──
function drawExhibitTitle(doc: jsPDF, title: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(title, x, y);
}

// ── Line Chart ──
function drawLineChart(
  doc: jsPDF, points: ChartPoint[],
  x: number, y: number, w: number, h: number,
  color: readonly [number, number, number],
  prefix = "", chartTitle = ""
) {
  if (points.length === 0) return;

  // Card
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...GRID_LINE);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");

  // Title inside
  if (chartTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...DARK_TEXT);
    doc.text(chartTitle, x + 5, y + 6);
  }

  const titleOffset = chartTitle ? 9 : 3;
  const chartX = x + 16;
  const chartY = y + titleOffset;
  const chartW = w - 20;
  const chartH = h - titleOffset - 14;

  const maxVal = Math.max(...points.map(p => p.value), 1);
  const ticks = niceScale(maxVal, 5);
  const scaleMax = ticks[ticks.length - 1] || 1;

  // Grid + Y labels
  ticks.forEach(tick => {
    const gy = chartY + chartH - (tick / scaleMax) * chartH;
    doc.setDrawColor(...GRID_LINE);
    doc.setLineWidth(0.08);
    doc.line(chartX, gy, chartX + chartW, gy);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...LABEL_TEXT);
    doc.text(formatAxisLabel(tick, prefix), chartX - 2, gy + 1.2, { align: "right" });
  });

  // Line
  doc.setDrawColor(...color);
  doc.setLineWidth(0.8);
  const getPoint = (i: number) => ({
    px: chartX + (i / Math.max(points.length - 1, 1)) * chartW,
    py: chartY + chartH - (points[i].value / scaleMax) * chartH,
  });
  for (let i = 0; i < points.length - 1; i++) {
    const a = getPoint(i);
    const b = getPoint(i + 1);
    doc.line(a.px, a.py, b.px, b.py);
  }

  // X labels
  drawXLabels(doc, points, chartX, chartY, chartW, chartH);

  // Average
  drawAvgLine(doc, points, chartX, chartY, chartW, chartH, scaleMax, prefix);
}

// ── Bar Chart ──
function drawBarChart(
  doc: jsPDF, points: ChartPoint[],
  x: number, y: number, w: number, h: number,
  color: readonly [number, number, number],
  prefix = "", chartTitle = ""
) {
  if (points.length === 0) return;

  doc.setFillColor(...WHITE);
  doc.setDrawColor(...GRID_LINE);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");

  if (chartTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...DARK_TEXT);
    doc.text(chartTitle, x + 5, y + 6);
  }

  const titleOffset = chartTitle ? 9 : 3;
  const chartX = x + 16;
  const chartY = y + titleOffset;
  const chartW = w - 20;
  const chartH = h - titleOffset - 14;

  const maxVal = Math.max(...points.map(p => p.value), 1);
  const ticks = niceScale(maxVal, 5);
  const scaleMax = ticks[ticks.length - 1] || 1;

  // Grid + Y labels
  ticks.forEach(tick => {
    const gy = chartY + chartH - (tick / scaleMax) * chartH;
    doc.setDrawColor(...GRID_LINE);
    doc.setLineWidth(0.08);
    doc.line(chartX, gy, chartX + chartW, gy);
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...LABEL_TEXT);
    doc.text(formatAxisLabel(tick, prefix), chartX - 2, gy + 1.2, { align: "right" });
  });

  // Bars
  const barWidth = (chartW / points.length) * 0.7;
  const gap = (chartW / points.length) * 0.3;
  points.forEach((p, i) => {
    const barH = (p.value / scaleMax) * chartH;
    const bx = chartX + i * (barWidth + gap) + gap / 2;
    const by = chartY + chartH - barH;
    doc.setFillColor(...color);
    doc.roundedRect(bx, by, barWidth, barH, 0.6, 0.6, "F");
  });

  // X labels
  drawXLabelsBar(doc, points, chartX, chartY, chartW, chartH, barWidth, gap);

  // Average
  drawAvgLine(doc, points, chartX, chartY, chartW, chartH, scaleMax, prefix);
}

// ── Shared: X labels (line) ──
function drawXLabels(doc: jsPDF, points: ChartPoint[], chartX: number, chartY: number, chartW: number, chartH: number) {
  // At 45° rotation with font 4, each label needs ~12mm horizontal clearance
  const maxLabels = Math.max(2, Math.floor(chartW / 12));
  const step = Math.max(1, Math.ceil(points.length / maxLabels));
  doc.setFontSize(4);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...LABEL_TEXT);
  points.forEach((p, i) => {
    if (i % step === 0) {
      const px = chartX + (i / Math.max(points.length - 1, 1)) * chartW;
      doc.text(p.label, px, chartY + chartH + 3, { angle: 45 });
    }
  });
}

// ── Shared: X labels (bar) ──
function drawXLabelsBar(doc: jsPDF, points: ChartPoint[], chartX: number, chartY: number, chartW: number, chartH: number, barWidth: number, gap: number) {
  const maxLabels = Math.max(2, Math.floor(chartW / 12));
  const step = Math.max(1, Math.ceil(points.length / maxLabels));
  doc.setFontSize(4);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...LABEL_TEXT);
  points.forEach((p, i) => {
    if (i % step === 0) {
      const px = chartX + i * (barWidth + gap) + gap / 2 + barWidth / 2;
      doc.text(p.label, px, chartY + chartH + 3, { angle: 45 });
    }
  });
}

// ── Shared: Average line + label ──
function drawAvgLine(doc: jsPDF, points: ChartPoint[], chartX: number, chartY: number, chartW: number, chartH: number, scaleMax: number, prefix: string) {
  const avg = Math.round(points.reduce((s, p) => s + p.value, 0) / points.length);
  const avgY = chartY + chartH - (avg / scaleMax) * chartH;

  doc.setDrawColor(170, 170, 178);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(chartX, avgY, chartX + chartW, avgY);
  doc.setLineDashPattern([], 0);

  // Label pill
  const avgText = `Avg: ${formatAxisLabel(avg, prefix)}`;
  const avgTextW = doc.getTextWidth(avgText) + 3;
  doc.setFillColor(...WHITE);
  doc.roundedRect(chartX + chartW - avgTextW - 2, chartY + 1, avgTextW + 2, 5, 1, 1, "F");
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...LABEL_TEXT);
  doc.text(avgText, chartX + chartW - 2, chartY + 4.5, { align: "right" });
}
