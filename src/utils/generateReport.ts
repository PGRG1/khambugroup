import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getVenueComparison } from "@/utils/salesUtils";

interface ReportOptions {
  data: SalesRecord[];
  venue: "All Venues" | "Assembly" | "Caliente";
  monthLabel: string;
}

const GOLD = [194, 155, 80] as const;
const DARK = [30, 28, 25] as const;
const LIGHT_BG = [250, 248, 244] as const;
const MUTED = [120, 110, 100] as const;

// Chart colors
const CHART_COLORS = {
  sales: [194, 155, 80],      // gold
  guests: [46, 160, 135],     // teal
  spendGuest: [230, 120, 60], // orange
  spendOrder: [180, 80, 60],  // rust
} as const;

export function generateMTDReport({ data, venue, monthLabel }: ReportOptions) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const addNewPageIfNeeded = (requiredSpace: number) => {
    if (y + requiredSpace > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
  };

  // ── HEADER BAND ──
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageWidth, 38, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 38, pageWidth, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("KHAMBU GROUP", margin, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text("Revenue Report", margin, 27);

  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text(`Period: ${monthLabel}`, pageWidth - margin, 16, { align: "right" });
  doc.text(venue === "All Venues" ? "All Venues" : venue, pageWidth - margin, 22, { align: "right" });
  doc.text(`Prepared by 77Nexus`, pageWidth - margin, 28, { align: "right" });

  y = 48;

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
    { label: "Total Sales", value: `$${formatCurrency(totalSales)}` },
    { label: "Total Guests", value: formatCurrency(totalGuests) },
    { label: "Total Orders", value: formatCurrency(totalOrders) },
    { label: "Avg / Guest", value: `$${formatCurrency(avgPerGuest)}` },
    { label: "Avg / Order", value: `$${formatCurrency(avgPerOrder)}` },
    { label: "Avg Daily Sales", value: `$${formatCurrency(avgDailySales)}` },
    { label: "Total Discount", value: `$${formatCurrency(Math.abs(totalDiscount))}` },
    { label: "Trading Days", value: String(daysCount) },
  ];

  const cardWidth = (contentWidth - 6) / 4;
  const cardHeight = 18;
  const cardGap = 2;

  kpis.forEach((kpi, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx = margin + col * (cardWidth + cardGap);
    const cy = y + row * (cardHeight + cardGap);

    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(cx, cy, cardWidth, cardHeight, 2, 2, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(kpi.label, cx + 4, cy + 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK);
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
      headStyles: { fillColor: DARK as any, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: DARK as any },
      alternateRowStyles: { fillColor: [252, 250, 247] },
      styles: { cellPadding: 3 },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── PREPARE CHART DATA ──
  type DailyAgg = { date: string; day: string; sales: number; guests: number; orders: number };
  const buildDailyData = (records: SalesRecord[]): DailyAgg[] => {
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
  };

  const combinedDaily = buildDailyData(data);
  const assemblyDaily = buildDailyData(data.filter(r => r.venue === "Assembly"));
  const calienteDaily = buildDailyData(data.filter(r => r.venue === "Caliente"));

  const halfWidth = (contentWidth - 4) / 2;
  const smallChartH = 45;
  const fullChartH = 55;

  const VENUE_COLORS = {
    assembly: [230, 120, 60] as readonly [number, number, number],
    caliente: [70, 130, 180] as readonly [number, number, number],
  };

  // Chart sections config
  const chartSections = [
    {
      title: "Daily Sales",
      type: "line" as const,
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

    // Section title (e.g. "Daily Sales")
    addNewPageIfNeeded(fullChartH + smallChartH + 35);
    drawSectionTitle(doc, section.title, margin, y);
    y += 10;

    // Combined chart (full width) — title inside chart
    drawFn(doc, section.getData(combinedDaily), margin, y, contentWidth, fullChartH, section.color, section.prefix, "Combined");
    y += fullChartH + 5;

    // Venue charts side by side — titles inside charts
    addNewPageIfNeeded(smallChartH + 12);
    drawFn(doc, section.getData(assemblyDaily), margin, y, halfWidth, smallChartH, VENUE_COLORS.assembly, section.prefix, "Assembly");
    drawFn(doc, section.getData(calienteDaily), margin + halfWidth + 4, y, halfWidth, smallChartH, VENUE_COLORS.caliente, section.prefix, "Caliente");
    y += smallChartH + 12;
  }


  // ── ADD FOOTERS TO ALL PAGES ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `Khambu Group — Confidential — Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const fileName = `Khambu_MTD_Report_${venue.replace(/\s/g, "_")}_${monthLabel.replace(/\s/g, "_")}.pdf`;
  doc.save(fileName);
}

// ── HELPER: Section Title (McKinsey style — clean, understated) ──
function drawSectionTitle(doc: jsPDF, title: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(title.toUpperCase(), x, y);
  // Thin gold accent line
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(x, y + 2.5, x + 18, y + 2.5);
}

// ── HELPER: Format date ──
function formatDateShort(date: string): string {
  const parts = date.split("-");
  return `${parts[1]}/${parts[2]}`;
}

// ── HELPER: Draw Line Chart ──
interface ChartPoint {
  label: string;
  value: number;
}

function drawLineChart(
  doc: jsPDF,
  points: ChartPoint[],
  x: number, y: number, w: number, h: number,
  color: readonly [number, number, number],
  prefix = "",
  chartTitle = ""
) {
  if (points.length === 0) return;

  // Card background with subtle border
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(230, 228, 224);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");

  // Internal title
  if (chartTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...DARK);
    doc.text(chartTitle, x + 5, y + 6);
  }

  const titleOffset = chartTitle ? 8 : 3;
  const chartX = x + 14;
  const chartY = y + titleOffset + 1;
  const chartW = w - 18;
  const chartH = h - titleOffset - 11;

  const maxVal = Math.max(...points.map(p => p.value), 1);
  const range = maxVal || 1;

  // Grid lines — light, minimal
  doc.setDrawColor(235, 233, 230);
  doc.setLineWidth(0.1);
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + chartH - (i / 4) * chartH;
    doc.line(chartX, gy, chartX + chartW, gy);
    const val = Math.round((i / 4) * range);
    doc.setFontSize(5.5);
    doc.setTextColor(...MUTED);
    doc.text(`${prefix}${formatCurrency(val)}`, chartX - 2, gy + 1, { align: "right" });
  }

  // Draw line
  doc.setDrawColor(...color);
  doc.setLineWidth(0.7);
  const getPoint = (i: number) => ({
    px: chartX + (i / Math.max(points.length - 1, 1)) * chartW,
    py: chartY + chartH - (points[i].value / range) * chartH,
  });

  for (let i = 0; i < points.length - 1; i++) {
    const a = getPoint(i);
    const b = getPoint(i + 1);
    doc.line(a.px, a.py, b.px, b.py);
  }

  // X labels
  const step = Math.max(1, Math.floor(points.length / 10));
  doc.setFontSize(5);
  doc.setTextColor(...MUTED);
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      const px = chartX + (i / Math.max(points.length - 1, 1)) * chartW;
      doc.text(p.label, px, chartY + chartH + 4, { align: "center" });
    }
  });

  // Average line + label INSIDE chart (top-right corner)
  const avg = Math.round(points.reduce((s, p) => s + p.value, 0) / points.length);
  const avgY = chartY + chartH - (avg / range) * chartH;
  doc.setDrawColor(190, 185, 178);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(chartX, avgY, chartX + chartW, avgY);
  doc.setLineDashPattern([], 0);

  // Avg label inside chart area, top-right
  doc.setFillColor(255, 255, 255);
  const avgText = `Avg: ${prefix}${formatCurrency(avg)}`;
  const avgTextW = doc.getTextWidth(avgText) + 3;
  doc.roundedRect(chartX + chartW - avgTextW - 2, chartY + 1, avgTextW + 2, 5, 1, 1, "F");
  doc.setFontSize(5.5);
  doc.setTextColor(...MUTED);
  doc.text(avgText, chartX + chartW - 2, chartY + 4.5, { align: "right" });
}

// ── HELPER: Draw Bar Chart ──
function drawBarChart(
  doc: jsPDF,
  points: ChartPoint[],
  x: number, y: number, w: number, h: number,
  color: readonly [number, number, number],
  prefix = "",
  chartTitle = ""
) {
  if (points.length === 0) return;

  // Card background with subtle border
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(230, 228, 224);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");

  // Internal title
  if (chartTitle) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...DARK);
    doc.text(chartTitle, x + 5, y + 6);
  }

  const titleOffset = chartTitle ? 8 : 3;
  const chartX = x + 14;
  const chartY = y + titleOffset + 1;
  const chartW = w - 18;
  const chartH = h - titleOffset - 11;

  const maxVal = Math.max(...points.map(p => p.value), 1);
  const range = maxVal || 1;

  // Grid lines
  doc.setDrawColor(235, 233, 230);
  doc.setLineWidth(0.1);
  for (let i = 0; i <= 4; i++) {
    const gy = chartY + chartH - (i / 4) * chartH;
    doc.line(chartX, gy, chartX + chartW, gy);
    const val = Math.round((i / 4) * range);
    doc.setFontSize(5.5);
    doc.setTextColor(...MUTED);
    doc.text(`${prefix}${formatCurrency(val)}`, chartX - 2, gy + 1, { align: "right" });
  }

  // Draw bars
  const barWidth = (chartW / points.length) * 0.7;
  const gap = (chartW / points.length) * 0.3;

  points.forEach((p, i) => {
    const barH = (p.value / range) * chartH;
    const bx = chartX + i * (barWidth + gap) + gap / 2;
    const by = chartY + chartH - barH;

    doc.setFillColor(...color);
    doc.roundedRect(bx, by, barWidth, barH, 0.8, 0.8, "F");
  });

  // X labels
  const step = Math.max(1, Math.floor(points.length / 10));
  doc.setFontSize(5);
  doc.setTextColor(...MUTED);
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      const px = chartX + i * (barWidth + gap) + gap / 2 + barWidth / 2;
      doc.text(p.label, px, chartY + chartH + 4, { align: "center" });
    }
  });

  // Average line + label INSIDE chart (top-right corner)
  const avg = Math.round(points.reduce((s, p) => s + p.value, 0) / points.length);
  const avgY = chartY + chartH - (avg / range) * chartH;
  doc.setDrawColor(190, 185, 178);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(chartX, avgY, chartX + chartW, avgY);
  doc.setLineDashPattern([], 0);

  // Avg label inside chart area, top-right
  doc.setFillColor(255, 255, 255);
  const avgText = `Avg: ${prefix}${formatCurrency(avg)}`;
  const avgTextW = doc.getTextWidth(avgText) + 3;
  doc.roundedRect(chartX + chartW - avgTextW - 2, chartY + 1, avgTextW + 2, 5, 1, 1, "F");
  doc.setFontSize(5.5);
  doc.setTextColor(...MUTED);
  doc.text(avgText, chartX + chartW - 2, chartY + 4.5, { align: "right" });
}
