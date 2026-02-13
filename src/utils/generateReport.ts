import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getPaymentBreakdown, getVenueComparison } from "@/utils/salesUtils";

interface ReportOptions {
  data: SalesRecord[];
  venue: "All Venues" | "Assembly" | "Caliente";
  monthLabel: string; // e.g. "Feb 2026"
  chartImages?: { dailySales?: string; paymentBreakdown?: string };
}

const GOLD = [194, 155, 80] as const; // #C29B50
const DARK = [30, 28, 25] as const;
const LIGHT_BG = [250, 248, 244] as const;
const MUTED = [120, 110, 100] as const;

export function generateMTDReport({ data, venue, monthLabel, chartImages }: ReportOptions) {
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
      addFooter();
    }
  };

  const addFooter = () => {
    const pageCount = doc.getNumberOfPages();
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `Khambu Group — Confidential — Page ${pageCount}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  };

  // ── HEADER BAND ──
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageWidth, 38, "F");

  // Gold accent line
  doc.setFillColor(...GOLD);
  doc.rect(0, 38, pageWidth, 1.5, "F");

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("KHAMBU GROUP", margin, 18);

  // Report title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text("Month-To-Date Revenue Report", margin, 27);

  // Meta info (right side)
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text(monthLabel, pageWidth - margin, 16, { align: "right" });
  doc.text(venue === "All Venues" ? "All Venues" : venue, pageWidth - margin, 22, { align: "right" });
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`, pageWidth - margin, 28, { align: "right" });

  y = 48;

  // ── KPI SUMMARY ──
  const totalSales = data.reduce((s, r) => s + r.totalSales, 0);
  const totalGuests = data.reduce((s, r) => s + r.guests, 0);
  const totalOrders = data.reduce((s, r) => s + r.orders, 0);
  const totalDiscount = data.reduce((s, r) => s + r.discount, 0);
  const avgPerGuest = totalGuests ? Math.round(totalSales / totalGuests) : 0;
  const avgPerOrder = totalOrders ? Math.round(totalSales / totalOrders) : 0;
  const daysCount = data.length;
  const avgDailySales = daysCount ? Math.round(totalSales / daysCount) : 0;

  // Section title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text("Performance Summary", margin, y);
  y += 2;

  // Gold underline
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 50, y);
  y += 6;

  // KPI cards
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

    // Card background
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(cx, cy, cardWidth, cardHeight, 2, 2, "F");

    // Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(kpi.label, cx + 4, cy + 6);

    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.text(kpi.value, cx + 4, cy + 14);
  });

  y += Math.ceil(kpis.length / 4) * (cardHeight + cardGap) + 8;

  // ── CHARTS ──
  if (chartImages?.dailySales) {
    addNewPageIfNeeded(80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.text("Daily Sales Trend", margin, y);
    y += 2;
    doc.setDrawColor(...GOLD);
    doc.line(margin, y, margin + 42, y);
    y += 4;

    try {
      doc.addImage(chartImages.dailySales, "PNG", margin, y, contentWidth, 60);
      y += 65;
    } catch {
      y += 5;
    }
  }

  if (chartImages?.paymentBreakdown) {
    addNewPageIfNeeded(80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.text("Payment Method Breakdown", margin, y);
    y += 2;
    doc.setDrawColor(...GOLD);
    doc.line(margin, y, margin + 55, y);
    y += 4;

    try {
      doc.addImage(chartImages.paymentBreakdown, "PNG", margin, y, contentWidth, 60);
      y += 65;
    } catch {
      y += 5;
    }
  }

  // ── PAYMENT BREAKDOWN TABLE ──
  addNewPageIfNeeded(40);
  const paymentData = getPaymentBreakdown(data);
  const paymentTotal = paymentData.reduce((s, p) => s + p.value, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text("Payment Methods", margin, y);
  y += 2;
  doc.setDrawColor(...GOLD);
  doc.line(margin, y, margin + 42, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Method", "Amount ($)", "% of Total"]],
    body: paymentData.map((p) => [
      p.name,
      `$${formatCurrency(p.value)}`,
      paymentTotal ? `${((p.value / paymentTotal) * 100).toFixed(1)}%` : "0%",
    ]),
    foot: [["Total", `$${formatCurrency(paymentTotal)}`, "100%"]],
    headStyles: {
      fillColor: DARK as any,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    footStyles: {
      fillColor: LIGHT_BG as any,
      textColor: DARK as any,
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, textColor: DARK as any },
    alternateRowStyles: { fillColor: [252, 250, 247] },
    styles: { cellPadding: 3 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ── VENUE COMPARISON (if All Venues) ──
  if (venue === "All Venues") {
    addNewPageIfNeeded(50);
    const venueComp = getVenueComparison(data);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.text("Venue Comparison", margin, y);
    y += 2;
    doc.setDrawColor(...GOLD);
    doc.line(margin, y, margin + 42, y);
    y += 4;

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
      headStyles: {
        fillColor: DARK as any,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, textColor: DARK as any },
      alternateRowStyles: { fillColor: [252, 250, 247] },
      styles: { cellPadding: 3 },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── DAILY BREAKDOWN TABLE ──
  addNewPageIfNeeded(30);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text("Daily Breakdown", margin, y);
  y += 2;
  doc.setDrawColor(...GOLD);
  doc.line(margin, y, margin + 40, y);
  y += 4;

  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Date", "Day", venue === "All Venues" ? "Venue" : "", "Orders", "Guests", "Total Sales", "Disc.", "SC"].filter(Boolean)],
    body: sortedData.map((r) => {
      const row = [
        r.date,
        r.day,
        ...(venue === "All Venues" ? [r.venue] : []),
        String(r.orders),
        String(r.guests),
        `$${formatCurrency(r.totalSales)}`,
        `$${formatCurrency(Math.abs(r.discount))}`,
        `$${formatCurrency(r.serviceCharge)}`,
      ];
      return row;
    }),
    foot: [[
      "Total", "", 
      ...(venue === "All Venues" ? [""] : []),
      String(totalOrders),
      String(totalGuests),
      `$${formatCurrency(totalSales)}`,
      `$${formatCurrency(Math.abs(totalDiscount))}`,
      `$${formatCurrency(data.reduce((s, r) => s + r.serviceCharge, 0))}`,
    ]],
    headStyles: {
      fillColor: DARK as any,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
    },
    footStyles: {
      fillColor: LIGHT_BG as any,
      textColor: DARK as any,
      fontStyle: "bold",
      fontSize: 7,
    },
    bodyStyles: { fontSize: 7, textColor: DARK as any },
    alternateRowStyles: { fillColor: [252, 250, 247] },
    styles: { cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 12 },
    },
  });

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

  // ── SAVE ──
  const fileName = `Khambu_MTD_Report_${venue.replace(/\s/g, "_")}_${monthLabel.replace(/\s/g, "_")}.pdf`;
  doc.save(fileName);
}
