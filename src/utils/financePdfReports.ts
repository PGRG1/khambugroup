import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Institutional palette (matches BANI brand) ──
const NAVY = [10, 30, 68] as const;
const GOLD = [200, 130, 50] as const;
const DARK = [20, 20, 30] as const;
const LABEL = [110, 110, 120] as const;
const GRID = [220, 220, 225] as const;
const WHITE = [255, 255, 255] as const;
const ROW_ALT = [248, 248, 250] as const;
const SECTION_BG = [232, 232, 240] as const;
const TOTAL_BG = [218, 222, 232] as const;

const fmt = (n: number) =>
  n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSigned = (n: number) =>
  n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n);

interface PageMeta {
  title: string;
  subtitle: string;
  periodLabel: string;
  filename: string;
  orientation?: "portrait" | "landscape";
}

function newDoc(meta: PageMeta) {
  const doc = new jsPDF({ orientation: meta.orientation || "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;

  // Header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 30, pageWidth, 0.7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  doc.text("KHAMBU GROUP", margin, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(210, 212, 220);
  doc.text(meta.title, margin, 21);

  doc.setFontSize(8);
  doc.setTextColor(180, 182, 195);
  doc.text(meta.subtitle, pageWidth - margin, 13, { align: "right" });
  doc.text(meta.periodLabel, pageWidth - margin, 19, { align: "right" });
  doc.text(`Generated: ${new Date().toLocaleDateString("en-HK")}`, pageWidth - margin, 25, { align: "right" });

  return { doc, pageWidth, pageHeight, margin, contentTop: 40 };
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number, margin: number) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFontSize(7);
    doc.setTextColor(...LABEL);
    doc.text("Khambu Group — Confidential", margin, pageHeight - 7);
    doc.text(`Page ${i} of ${total}`, pageWidth - margin, pageHeight - 7, { align: "right" });
  }
}

/* ─────────────────────────────────────────────────
   Balance Sheet
───────────────────────────────────────────────── */
export interface BSSection {
  title: string;
  accounts: { code: string; name: string; total: number }[];
  subtotal: number;
}

export function generateBalanceSheetPDF(args: {
  asOf: string;
  assets: BSSection;
  liabilities: BSSection;
  equity: BSSection;
  retainedEarnings: number;
  totalEquity: number;
  totalLE: number;
  balanced: boolean;
}) {
  const { doc, pageWidth, pageHeight, margin, contentTop } = newDoc({
    title: "Balance Sheet",
    subtitle: "Statement of Financial Position",
    periodLabel: `As of ${args.asOf}`,
    filename: `bani_balance_sheet_${args.asOf}.pdf`,
  });

  let y = contentTop + 4;
  const buildBody = (sec: BSSection, withRetained?: number) => {
    const body: any[] = [];
    sec.accounts.forEach((a) =>
      body.push([
        { content: a.code, styles: { textColor: LABEL as any, font: "courier", fontSize: 8 } },
        a.name,
        { content: fmtSigned(a.total), styles: { halign: "right", font: "courier" } },
      ]),
    );
    if (withRetained !== undefined) {
      body.push([
        "",
        { content: "Retained Earnings (Profit & Loss to date)", styles: { fontStyle: "italic", textColor: LABEL as any } },
        { content: fmtSigned(withRetained), styles: { halign: "right", font: "courier", fontStyle: "italic" } },
      ]);
    }
    body.push([
      "",
      { content: `Total ${sec.title}`, styles: { fontStyle: "bold", fillColor: TOTAL_BG as any } },
      {
        content: fmtSigned(sec.subtotal + (withRetained ?? 0)),
        styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any },
      },
    ]);
    return body;
  };

  const drawSection = (sec: BSSection, withRetained?: number) => {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [[{ content: sec.title.toUpperCase(), colSpan: 3, styles: { fillColor: NAVY as any, textColor: [...WHITE], halign: "left", fontSize: 9 } }]],
      body: buildBody(sec, withRetained) as any,
      styles: { fontSize: 8.5, cellPadding: 2.2, textColor: DARK as any, lineColor: [230, 230, 235], lineWidth: 0.15 },
      alternateRowStyles: { fillColor: ROW_ALT as any },
      columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 36 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  };

  drawSection(args.assets);
  drawSection(args.liabilities);
  drawSection(args.equity, args.retainedEarnings);

  // Recap
  if (y + 22 > pageHeight - 20) { doc.addPage(); y = 20; }
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: ([
      [
        { content: "Total Assets", styles: { fontStyle: "bold" } },
        { content: fmtSigned(args.assets.subtotal), styles: { halign: "right", font: "courier", fontStyle: "bold" } },
        { content: "Total Liabilities + Equity", styles: { fontStyle: "bold" } },
        { content: fmtSigned(args.totalLE), styles: { halign: "right", font: "courier", fontStyle: "bold" } },
      ],
      [{
        content: args.balanced
          ? "✓ Statement is balanced."
          : `Out of balance: ${fmtSigned(args.assets.subtotal - args.totalLE)}`,
        colSpan: 4,
        styles: {
          halign: "center",
          textColor: args.balanced ? ([20, 100, 60] as any) : ([160, 30, 30] as any),
          fontStyle: "bold",
          fillColor: SECTION_BG as any,
        },
      }],
    ] as any),
    styles: { fontSize: 9, cellPadding: 3 },
  });

  drawFooter(doc, pageWidth, pageHeight, margin);
  doc.save(`bani_balance_sheet_${args.asOf}.pdf`);
}

/* ─────────────────────────────────────────────────
   Trial Balance
───────────────────────────────────────────────── */
export interface TBRow {
  code: string;
  name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

export function generateTrialBalancePDF(args: {
  fromDate?: string;
  toDate: string;
  rows: TBRow[];
  groups: { type: string; label: string; rows: TBRow[] }[];
  totalDebit: number;
  totalCredit: number;
}) {
  const { doc, pageWidth, pageHeight, margin, contentTop } = newDoc({
    title: "Trial Balance",
    subtitle: "Posted Journal Entries",
    periodLabel: args.fromDate ? `${args.fromDate} → ${args.toDate}` : `As of ${args.toDate}`,
    filename: `bani_trial_balance_${args.toDate}.pdf`,
  });

  const body: any[] = [];
  args.groups.forEach((g) => {
    if (g.rows.length === 0) return;
    body.push([
      {
        content: g.label.toUpperCase(),
        colSpan: 5,
        styles: { fillColor: SECTION_BG as any, fontStyle: "bold", fontSize: 8.5, textColor: NAVY as any },
      },
    ]);
    g.rows.forEach((r) => {
      body.push([
        { content: r.code, styles: { font: "courier", fontSize: 8, textColor: LABEL as any } },
        r.name,
        { content: r.total_debit ? fmt(r.total_debit) : "", styles: { halign: "right", font: "courier" } },
        { content: r.total_credit ? fmt(r.total_credit) : "", styles: { halign: "right", font: "courier" } },
        { content: fmtSigned(r.balance), styles: { halign: "right", font: "courier", fontStyle: "bold" } },
      ]);
    });
  });

  const balanced = Math.round((args.totalDebit - args.totalCredit) * 100) === 0;
  body.push([
    { content: "Totals", colSpan: 2, styles: { fontStyle: "bold", fillColor: TOTAL_BG as any } },
    { content: fmt(args.totalDebit), styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any } },
    { content: fmt(args.totalCredit), styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any } },
    {
      content: balanced ? "✓ Balanced" : fmtSigned(args.totalDebit - args.totalCredit),
      styles: {
        halign: "right",
        font: "courier",
        fontStyle: "bold",
        fillColor: TOTAL_BG as any,
        textColor: balanced ? ([20, 100, 60] as any) : ([160, 30, 30] as any),
      },
    },
  ]);

  autoTable(doc, {
    startY: contentTop + 2,
    margin: { left: margin, right: margin, bottom: 18 },
    head: [["Code", "Account", "Debit", "Credit", "Balance"]],
    body: body as any,
    headStyles: { fillColor: NAVY as any, textColor: [...WHITE], fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2, textColor: DARK as any, lineColor: [230, 230, 235], lineWidth: 0.15 },
    alternateRowStyles: { fillColor: ROW_ALT as any },
    columnStyles: {
      0: { cellWidth: 22 },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 32, halign: "right" },
    },
  });

  drawFooter(doc, pageWidth, pageHeight, margin);
  doc.save(`bani_trial_balance_${args.toDate}.pdf`);
}

/* ─────────────────────────────────────────────────
   Cash Flow Statement (Direct Method)
───────────────────────────────────────────────── */
export interface CFLine {
  section: "operating" | "investing" | "financing";
  lineItem: string;
  amount: number;
}

export function generateCashflowPDF(args: {
  fromDate: string;
  toDate: string;
  venueLabel: string;
  opening: number;
  closing: number;
  netChange: number;
  sectionTotals: Record<"operating" | "investing" | "financing", number>;
  linesBySection: Record<"operating" | "investing" | "financing", CFLine[]>;
  cashAccounts: { code: string; name: string; balance: number }[];
}) {
  const { doc, pageWidth, pageHeight, margin, contentTop } = newDoc({
    title: "Statement of Cash Flows",
    subtitle: `Direct Method — ${args.venueLabel}`,
    periodLabel: `${args.fromDate} → ${args.toDate}`,
    filename: `bani_cashflow_${args.fromDate}_${args.toDate}.pdf`,
  });

  const SECTION_LABELS = {
    operating: "Operating Activities",
    investing: "Investing Activities",
    financing: "Financing Activities",
  } as const;

  const body: any[] = [];

  body.push([
    { content: "Opening cash & cash equivalents", styles: { fontStyle: "bold" } },
    { content: fmtSigned(args.opening), styles: { halign: "right", font: "courier", fontStyle: "bold" } },
  ]);

  (["operating", "investing", "financing"] as const).forEach((sec) => {
    body.push([
      { content: SECTION_LABELS[sec].toUpperCase(), colSpan: 2, styles: { fillColor: SECTION_BG as any, fontStyle: "bold", fontSize: 8.5, textColor: NAVY as any } },
    ]);
    const items = args.linesBySection[sec];
    if (items.length === 0) {
      body.push([{ content: "  No activity", colSpan: 2, styles: { fontStyle: "italic", textColor: LABEL as any } }]);
    } else {
      items.forEach((l) => {
        body.push([
          `   ${l.lineItem}`,
          { content: fmtSigned(l.amount), styles: { halign: "right", font: "courier", textColor: l.amount < 0 ? ([160, 30, 30] as any) : (DARK as any) } },
        ]);
      });
    }
    body.push([
      { content: `Net cash ${args.sectionTotals[sec] >= 0 ? "from" : "used in"} ${sec} activities`, styles: { fontStyle: "italic", fillColor: ROW_ALT as any } },
      { content: fmtSigned(args.sectionTotals[sec]), styles: { halign: "right", font: "courier", fontStyle: "italic", fillColor: ROW_ALT as any } },
    ]);
  });

  body.push([
    { content: "Net increase / (decrease) in cash", styles: { fontStyle: "bold", fillColor: TOTAL_BG as any } },
    { content: fmtSigned(args.netChange), styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any } },
  ]);
  body.push([
    "Opening cash & cash equivalents",
    { content: fmtSigned(args.opening), styles: { halign: "right", font: "courier" } },
  ]);
  body.push([
    { content: "Closing cash & cash equivalents", styles: { fontStyle: "bold", fillColor: TOTAL_BG as any } },
    { content: fmtSigned(args.closing), styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any } },
  ]);

  autoTable(doc, {
    startY: contentTop + 2,
    margin: { left: margin, right: margin, bottom: 18 },
    body: body as any,
    styles: { fontSize: 8.8, cellPadding: 2.2, textColor: DARK as any, lineColor: [230, 230, 235], lineWidth: 0.15 },
    columnStyles: { 1: { cellWidth: 45, halign: "right" } },
  });

  // Cash account balances
  let y2 = (doc as any).lastAutoTable.finalY + 8;
  if (y2 + 30 > pageHeight - 20) { doc.addPage(); y2 = 20; }
  autoTable(doc, {
    startY: y2,
    margin: { left: margin, right: margin },
    head: [[{ content: `Closing Cash Balances (as of ${args.toDate})`, colSpan: 3, styles: { fillColor: NAVY as any, textColor: [...WHITE], halign: "left", fontSize: 9 } }]],
    body: ([
      ...args.cashAccounts.map((a) => [
        { content: a.code, styles: { font: "courier", fontSize: 8, textColor: LABEL as any } },
        a.name,
        { content: fmtSigned(a.balance), styles: { halign: "right", font: "courier" } },
      ]),
      [
        "",
        { content: "Total cash", styles: { fontStyle: "bold", fillColor: TOTAL_BG as any } },
        {
          content: fmtSigned(args.cashAccounts.reduce((s, a) => s + a.balance, 0)),
          styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any },
        },
      ],
    ] as any),
    styles: { fontSize: 8.5, cellPadding: 2 },
    alternateRowStyles: { fillColor: ROW_ALT as any },
    columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 40 } },
  });

  drawFooter(doc, pageWidth, pageHeight, margin);
  doc.save(`bani_cashflow_${args.fromDate}_${args.toDate}.pdf`);
}

/* ─────────────────────────────────────────────────
   P&L (Ledger) — multi-period grid
───────────────────────────────────────────────── */
export interface LedgerPLColumn { key: string; label: string; }
export interface LedgerPLRow {
  label: string;
  code?: string;
  depth: number;
  isSection?: boolean;
  isSubtotal?: boolean;
  isComputed?: boolean;
  isFinal?: boolean;
  cells: number[];
  total?: number;
}

export function generateLedgerPLPDF(args: {
  periodLabel: string;
  columns: LedgerPLColumn[];
  rows: LedgerPLRow[];
  showGrandTotal: boolean;
}) {
  const orientation = args.columns.length > 4 ? "landscape" : "portrait";
  const { doc, pageWidth, pageHeight, margin, contentTop } = newDoc({
    title: "Profit & Loss (Ledger)",
    subtitle: "Built from posted journal entries",
    periodLabel: args.periodLabel,
    filename: `khambu_pl_ledger.pdf`,
    orientation,
  });

  const head = [[
    "Account",
    ...args.columns.map((c) => c.label),
    ...(args.showGrandTotal ? ["TOTAL"] : []),
  ]];

  const body: any[] = args.rows.map((r) => {
    if (r.isSection) {
      return [{
        content: r.label.toUpperCase(),
        colSpan: 1 + args.columns.length + (args.showGrandTotal ? 1 : 0),
        styles: { fillColor: SECTION_BG as any, fontStyle: "bold", fontSize: 8.5, textColor: NAVY as any },
      }];
    }
    const labelCell = {
      content: (r.code ? `${r.code}  ` : "") + r.label,
      styles: {
        fontStyle: r.isSubtotal || r.isComputed || r.isFinal ? "bold" : "normal",
        fillColor: r.isFinal ? (TOTAL_BG as any) : r.isSubtotal || r.isComputed ? (ROW_ALT as any) : undefined,
      } as any,
    };
    if (r.depth > 0 && !r.isSubtotal && !r.isComputed && !r.isFinal) {
      labelCell.content = `${"  ".repeat(r.depth)}${labelCell.content}`;
    }
    const cells = r.cells.map((v) => ({
      content: v === 0 ? "—" : fmtSigned(v),
      styles: {
        halign: "right",
        font: "courier",
        fontStyle: r.isSubtotal || r.isComputed || r.isFinal ? "bold" : "normal",
        fillColor: r.isFinal ? (TOTAL_BG as any) : r.isSubtotal || r.isComputed ? (ROW_ALT as any) : undefined,
        textColor: v < 0 ? ([160, 30, 30] as any) : (DARK as any),
      } as any,
    }));
    const totalCell = args.showGrandTotal ? [{
      content: r.total === undefined || r.total === 0 ? "—" : fmtSigned(r.total),
      styles: {
        halign: "right",
        font: "courier",
        fontStyle: "bold",
        fillColor: r.isFinal ? (TOTAL_BG as any) : (ROW_ALT as any),
        textColor: (r.total ?? 0) < 0 ? ([160, 30, 30] as any) : (DARK as any),
      } as any,
    }] : [];
    return [labelCell, ...cells, ...totalCell];
  });

  autoTable(doc, {
    startY: contentTop + 2,
    margin: { left: margin, right: margin, bottom: 18 },
    head: head as any,
    body: body as any,
    headStyles: { fillColor: NAVY as any, textColor: [...WHITE], fontSize: 8.5, halign: "right" },
    styles: { fontSize: 8, cellPadding: 1.6, textColor: DARK as any, lineColor: [230, 230, 235], lineWidth: 0.15 },
    columnStyles: { 0: { halign: "left", cellWidth: orientation === "landscape" ? 70 : 70 } },
    didParseCell: (d) => {
      if (d.section === "head" && d.column.index === 0) (d.cell.styles as any).halign = "left";
    },
  });

  drawFooter(doc, pageWidth, pageHeight, margin);
  doc.save(`khambu_pl_ledger.pdf`);
}

/* ─────────────────────────────────────────────────
   Cashflow (Ledger) — period buckets + breakdowns
───────────────────────────────────────────────── */
export interface LedgerCFBucket {
  label: string;
  inflows: number;
  outflows: number;
  net: number;
  runningBalance: number;
}
export interface LedgerCFBreakdownRow {
  label: string;
  cashIn: number;
  cashOut: number;
  net: number;
}

export function generateLedgerCashflowPDF(args: {
  periodLabel: string;
  granularity: string;
  venueLabel: string;
  accountLabel: string;
  totals: { opening: number; cashIn: number; cashOut: number; net: number; closing: number };
  buckets: LedgerCFBucket[];
  byAccount: LedgerCFBreakdownRow[];
  bySource: LedgerCFBreakdownRow[];
}) {
  const { doc, pageWidth, pageHeight, margin, contentTop } = newDoc({
    title: "Cashflow (Ledger)",
    subtitle: `${args.granularity} · ${args.venueLabel} · ${args.accountLabel}`,
    periodLabel: args.periodLabel,
    filename: `khambu_cashflow_ledger.pdf`,
  });

  // KPI strip
  autoTable(doc, {
    startY: contentTop + 2,
    margin: { left: margin, right: margin },
    body: ([
      [
        { content: "Opening", styles: { fontStyle: "bold", fillColor: SECTION_BG as any } },
        { content: "Cash In", styles: { fontStyle: "bold", fillColor: SECTION_BG as any } },
        { content: "Cash Out", styles: { fontStyle: "bold", fillColor: SECTION_BG as any } },
        { content: "Net", styles: { fontStyle: "bold", fillColor: SECTION_BG as any } },
        { content: "Closing", styles: { fontStyle: "bold", fillColor: SECTION_BG as any } },
      ],
      [
        { content: fmtSigned(args.totals.opening), styles: { halign: "right", font: "courier" } },
        { content: fmtSigned(args.totals.cashIn), styles: { halign: "right", font: "courier", textColor: [20, 100, 60] as any } },
        { content: `(${fmt(args.totals.cashOut)})`, styles: { halign: "right", font: "courier", textColor: [160, 30, 30] as any } },
        { content: fmtSigned(args.totals.net), styles: { halign: "right", font: "courier", fontStyle: "bold" } },
        { content: fmtSigned(args.totals.closing), styles: { halign: "right", font: "courier", fontStyle: "bold" } },
      ],
    ] as any),
    styles: { fontSize: 9, cellPadding: 2.5 },
  });

  let y = (doc as any).lastAutoTable.finalY + 6;

  // Period breakdown
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin, bottom: 18 },
    head: [[
      { content: "Period breakdown", colSpan: 5, styles: { fillColor: NAVY as any, textColor: [...WHITE], halign: "left", fontSize: 9 } },
    ], ["Period", "Cash In", "Cash Out", "Net", "Running Balance"]],
    body: args.buckets.map((b) => [
      b.label,
      { content: fmt(b.inflows), styles: { halign: "right", font: "courier", textColor: [20, 100, 60] as any } },
      { content: `(${fmt(b.outflows)})`, styles: { halign: "right", font: "courier", textColor: [160, 30, 30] as any } },
      { content: fmtSigned(b.net), styles: { halign: "right", font: "courier", fontStyle: "bold", textColor: b.net < 0 ? ([160, 30, 30] as any) : (DARK as any) } },
      { content: fmtSigned(b.runningBalance), styles: { halign: "right", font: "courier" } },
    ]) as any,
    foot: [[
      { content: "Total", styles: { fontStyle: "bold", fillColor: TOTAL_BG as any } },
      { content: fmt(args.totals.cashIn), styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any, textColor: [20, 100, 60] as any } },
      { content: `(${fmt(args.totals.cashOut)})`, styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any, textColor: [160, 30, 30] as any } },
      { content: fmtSigned(args.totals.net), styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any } },
      { content: fmtSigned(args.totals.closing), styles: { halign: "right", font: "courier", fontStyle: "bold", fillColor: TOTAL_BG as any } },
    ]] as any,
    styles: { fontSize: 8.5, cellPadding: 2, textColor: DARK as any, lineColor: [230, 230, 235], lineWidth: 0.15 },
    alternateRowStyles: { fillColor: ROW_ALT as any },
    headStyles: { fillColor: NAVY as any, textColor: [...WHITE] as any, fontSize: 8.5 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  const renderBreakdown = (title: string, rows: LedgerCFBreakdownRow[]) => {
    if (y + 30 > pageHeight - 20) { doc.addPage(); y = 20; }
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 18 },
      head: [[
        { content: title, colSpan: 4, styles: { fillColor: NAVY as any, textColor: [...WHITE] as any, halign: "left", fontSize: 9 } },
      ], ["Item", "In", "Out", "Net"]],
      body: (rows.length === 0
        ? [[{ content: "No activity", colSpan: 4, styles: { fontStyle: "italic", textColor: LABEL as any, halign: "center" } }]]
        : rows.map((r) => [
            r.label,
            { content: fmt(r.cashIn), styles: { halign: "right", font: "courier", textColor: [20, 100, 60] as any } },
            { content: `(${fmt(r.cashOut)})`, styles: { halign: "right", font: "courier", textColor: [160, 30, 30] as any } },
            { content: fmtSigned(r.net), styles: { halign: "right", font: "courier", fontStyle: "bold", textColor: r.net < 0 ? ([160, 30, 30] as any) : (DARK as any) } },
          ])) as any,
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: [230, 230, 235], lineWidth: 0.15 },
      alternateRowStyles: { fillColor: ROW_ALT as any },
      headStyles: { fillColor: NAVY as any, textColor: [...WHITE] as any, fontSize: 8.5 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  };

  renderBreakdown("By cash account", args.byAccount);
  renderBreakdown("By source", args.bySource);

  drawFooter(doc, pageWidth, pageHeight, margin);
  doc.save(`khambu_cashflow_ledger.pdf`);
}
