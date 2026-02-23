import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PLPeriodData } from "@/hooks/usePLData";
import { KNOWN_LINES } from "@/hooks/usePLData";

// Warm orange palette matching the web app
const TERRACOTTA = [194, 89, 35] as const;     // hsl(24,80%,50%) ≈ #C25923
const DARK_BROWN = [56, 46, 38] as const;       // --foreground
const WARM_CREAM = [250, 247, 243] as const;    // --background
const GOLD_ACCENT = [200, 130, 50] as const;
const LABEL_TEXT = [130, 115, 100] as const;
const GRID_LINE = [225, 218, 210] as const;
const WHITE = [255, 255, 255] as const;

const HEADER_BG = [220, 208, 194] as const;      // warm header
const TOTAL_BG = [235, 224, 210] as const;        // subtotal rows
const GRAND_TOTAL_BG = [215, 198, 178] as const;  // bold totals
const SECTION_BG = [238, 232, 225] as const;
const ROW_EVEN = [248, 244, 239] as const;
const ROW_ODD = [253, 251, 248] as const;
const RATIO_BG = [245, 241, 236] as const;

interface PLLine {
  label: string;
  type: "header" | "subheader" | "section" | "item" | "editable" | "subtotal" | "total" | "ratio" | "blank";
  indent?: number;
  bold?: boolean;
  getValue: (d: PLPeriodData) => number | string | undefined;
}

interface GroupedColumn {
  label: string;
  data: PLPeriodData;
}

interface PLReportOptions {
  lines: PLLine[];
  columns: GroupedColumn[];
  totals: PLPeriodData;
  showTotal: boolean;
  periodLabel: string;
}

const fmt = (n: number) => n === 0 ? "—" : n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function generatePLReportPDF({ lines, columns, totals, showTotal, periodLabel }: PLReportOptions) {
  const doc = new jsPDF({ orientation: columns.length > 4 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ── HEADER ──
  doc.setFillColor(...TERRACOTTA);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setFillColor(...GOLD_ACCENT);
  doc.rect(0, 32, pageWidth, 0.7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text("KHAMBU GROUP", margin, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(255, 230, 210);
  doc.text("Profit & Loss Statement", margin, 20);

  doc.setFontSize(7.5);
  doc.setTextColor(255, 220, 195);
  doc.text(`Period: ${periodLabel}`, pageWidth - margin, 12, { align: "right" });
  doc.text("Prepared for internal management use only", pageWidth - margin, 18, { align: "right" });
  doc.text(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`, pageWidth - margin, 24, { align: "right" });

  // ── BUILD TABLE DATA ──
  const colCount = columns.length + (showTotal ? 1 : 0);
  const head = ["", ...columns.map(c => c.label)];
  if (showTotal) head.push("TOTAL");

  const body: any[][] = [];
  const rowStyles: Record<number, any> = {};

  let rowIdx = 0;
  for (const line of lines) {
    if (line.type === "blank") {
      body.push(Array(head.length).fill(""));
      rowStyles[rowIdx] = { fillColor: WHITE, minCellHeight: 1.5, fontSize: 3 };
      rowIdx++;
      continue;
    }

    const row: string[] = [];
    const indent = "  ".repeat(line.indent || 0);
    row.push(`${indent}${line.label}`);

    for (const col of columns) {
      const val = line.getValue(col.data);
      row.push(val === undefined ? "" : typeof val === "number" ? fmt(val) : String(val));
    }
    if (showTotal) {
      const val = line.getValue(totals);
      row.push(val === undefined ? "" : typeof val === "number" ? fmt(val) : String(val));
    }

    body.push(row);

    // Styling per row type
    if (line.type === "header") {
      rowStyles[rowIdx] = { fillColor: HEADER_BG, textColor: DARK_BROWN, fontStyle: "bold", fontSize: 7.5 };
    } else if (line.type === "total" && line.bold) {
      rowStyles[rowIdx] = { fillColor: GRAND_TOTAL_BG, textColor: DARK_BROWN, fontStyle: "bold", fontSize: 8 };
    } else if (line.type === "total" || line.type === "subtotal") {
      rowStyles[rowIdx] = { fillColor: TOTAL_BG, textColor: DARK_BROWN, fontStyle: "bold", fontSize: 7.5 };
    } else if (line.type === "section" || line.type === "subheader") {
      rowStyles[rowIdx] = { fillColor: SECTION_BG, textColor: [...TERRACOTTA], fontStyle: "bold", fontSize: 7 };
    } else if (line.type === "ratio") {
      rowStyles[rowIdx] = { fillColor: RATIO_BG, textColor: LABEL_TEXT, fontStyle: "italic", fontSize: 7 };
    } else {
      rowStyles[rowIdx] = { fillColor: rowIdx % 2 === 0 ? ROW_EVEN : ROW_ODD, textColor: DARK_BROWN, fontSize: 7.5 };
    }
    rowIdx++;
  }

  // ── DRAW TABLE ──
  autoTable(doc, {
    startY: 38,
    margin: { left: margin, right: margin },
    head: [head],
    body,
    headStyles: {
      fillColor: TERRACOTTA as any,
      textColor: WHITE as any,
      fontStyle: "bold",
      fontSize: 7,
      halign: "right",
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    columnStyles: {
      0: { halign: "left", cellWidth: columns.length > 6 ? 38 : 48 },
      ...Object.fromEntries(
        Array.from({ length: colCount }, (_, i) => [i + 1, { halign: "right" as const }])
      ),
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
      textColor: DARK_BROWN as any,
      lineColor: GRID_LINE as any,
      lineWidth: 0.1,
    },
    alternateRowStyles: {},
    styles: {
      font: "helvetica",
      overflow: "linebreak",
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        const style = rowStyles[data.row.index];
        if (style) {
          if (style.fillColor) data.cell.styles.fillColor = style.fillColor;
          if (style.textColor) data.cell.styles.textColor = style.textColor;
          if (style.fontStyle) data.cell.styles.fontStyle = style.fontStyle;
          if (style.fontSize) data.cell.styles.fontSize = style.fontSize;
          if (style.minCellHeight) data.cell.styles.minCellHeight = style.minCellHeight;
        }
        // Negative values in red
        if (data.column.index > 0) {
          const text = data.cell.raw as string;
          if (text && text.startsWith("-")) {
            data.cell.styles.textColor = [180, 50, 40];
          }
        }
        // Total column border
        if (showTotal && data.column.index === head.length - 1) {
          data.cell.styles.lineWidth = { left: 0.3, right: 0.1, top: 0.1, bottom: 0.1 };
        }
      }
    },
  });

  // ── FOOTERS ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setDrawColor(...TERRACOTTA);
      doc.setLineWidth(0.3);
      doc.line(margin, 8, pageWidth - margin, 8);
      doc.setFontSize(6);
      doc.setTextColor(...LABEL_TEXT);
      doc.text("Khambu Group — P&L Statement", margin, 6.5);
      doc.text(periodLabel, pageWidth - margin, 6.5, { align: "right" });
    }
    doc.setDrawColor(...GRID_LINE);
    doc.setLineWidth(0.15);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setFontSize(6);
    doc.setTextColor(...LABEL_TEXT);
    doc.text("Khambu Group — Confidential — For internal management use only", margin, pageHeight - 6.5);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6.5, { align: "right" });
  }

  const fileName = `Khambu_PL_Statement_${periodLabel.replace(/[\s,]+/g, "_")}.pdf`;
  doc.save(fileName);
}
