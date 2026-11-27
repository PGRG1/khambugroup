import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChatBillCard, ChatCashSlipCard } from "@/components/expenses/ChatExpenseCards";
import { billDraftFromScan, billNeedsFullScreen, type BillLookups } from "@/utils/billFromScan";
import { cashSlipProblem } from "@/utils/cashSlip";

const lookups: BillLookups = {
  suppliers: [{ id: "s1", name: "CLP Power" }],
  meters: [{ id: "m1", supplier_id: "s1", account_number: "0213-55", covers: [] } as any],
  aliases: [],
  venues: [{ id: "v1", name: "Assembly" }],
  categories: [{ id: "c1", name: "Electricity", default_account_id: "a1" }],
  accounts: [{ id: "a1", code: "6100", name: "Utilities" }, { id: "a2", code: "6900", name: "Other" }],
};
const scan = (o: Record<string, unknown> = {}) => ({
  vendor_name: "CLP Power", bill_number: "8812", bill_date: "2026-11-12", due_date: "2026-12-03", service_period_start: "2026-10-12", service_period_end: "2026-11-11",
  venue: "Assembly", currency: "HKD", subtotal: 4860, tax_amount: 0, total_amount: 4860, notes: "", suggested_document_type: "expense_bill", account_number: "0213 55",
  allocations: [{ expense_category: "Electricity", amount: 4620, notes: "" }, { expense_category: "Fuel cost adjustment", amount: 240, notes: "" }], ...o,
}) as any;

describe("Bani chat expenses", () => {
  it("maps a scanned bill exactly like Expenses › Bills (supplier, meter, venue, accounts)", () => {
    const d = billDraftFromScan(scan(), lookups);
    expect(d.matched).toBe(true);
    expect(d.header).toMatchObject({ supplier_id: "s1", supplier_account_id: "m1", venue_id: "v1", approval_status: "draft" });
    expect(d.allocations.map(a => a.account_id)).toEqual(["a1", null]);
    expect(billNeedsFullScreen(scan(), d, false)).toBe("");
  });

  it("sends unclear bills to the full screen", () => {
    const unknown = scan({ vendor_name: "New Co", account_number: "" });
    expect(billNeedsFullScreen(unknown, billDraftFromScan(unknown, lookups), false)).toMatch(/supplier/);
    expect(billNeedsFullScreen(scan(), billDraftFromScan(scan(), lookups), true)).toMatch(/contract/);
    const bf = scan({ brought_forward: 300 });
    expect(billNeedsFullScreen(bf, billDraftFromScan(bf, lookups), false)).toMatch(/balance/);
    const off = scan({ subtotal: 5000, total_amount: 5000 });
    expect(billNeedsFullScreen(off, billDraftFromScan(off, lookups), false)).toMatch(/add up/);
  });

  const booked = { phase: "booked" as const, said: [], vendor: "CLP Power", number: "8812", due: "2026-12-03", currency: "HKD", recordsTo: "Nov",
    rows: [{ left: "Assembly · fixed", amount: 400 }, { left: "Hanabi · the rest", amount: 4460 }], undoing: false, onUndo: vi.fn(), onSee: vi.fn(), onOpenFull: vi.fn() };

  it("shows the Booked card with month, rows and footer, and no approval buttons", () => {
    render(<ChatBillCard {...booked} canUndo />);
    expect(screen.getByText("Booked")).toBeTruthy();
    expect(screen.getByText("Records to Nov")).toBeTruthy();
    expect(screen.getByText("4,460.00")).toBeTruthy();
    expect(screen.getByText(/CLP Power · Bill 8812 · Due/)).toBeTruthy();
    expect(screen.queryByText("Send for approval")).toBeNull();
    expect(screen.queryByText("Hold")).toBeNull();
    fireEvent.click(screen.getByText("Undo"));
    expect(booked.onUndo).toHaveBeenCalledTimes(1);
  });

  it("lays the bill out before booking: Book waits for an expense type, and shows where it lands in the P&L", () => {
    const onBook = vi.fn(), onAccount = vi.fn();
    const review = { number: "20261518", date: "2026-11-27", due: "2026-11-27", venue: "ARKA", venues: ["ARKA"], terms: "Cash", total: 300, newVendor: true, saving: false,
      lines: [{ line_no: 1, description: "Pest control", amount: 300, account_id: null as string | null }],
      accounts: [{ id: "c", code: "6310", name: "Cleaning & Waste Disposal", group: "Running costs" }],
      onField: vi.fn(), onAccount, onBook, onHold: vi.fn() };
    const { rerender } = render(<ChatBillCard {...booked} canUndo={false} phase="review" vendor="Masterly" review={review} />);
    expect(screen.getByText("● New vendor, added when you book")).toBeTruthy();
    expect((screen.getByText(/^Book HK/) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Expense type for Pest control"), { target: { value: "c" } });
    expect(onAccount).toHaveBeenCalledWith(1, "c");
    rerender(<ChatBillCard {...booked} canUndo={false} phase="review" vendor="Masterly" review={{ ...review, lines: [{ ...review.lines[0], account_id: "c" }] }} />);
    expect(screen.getByText(/6310 Cleaning & Waste Disposal/)).toBeTruthy();
    fireEvent.click(screen.getByText(/^Book HK/));
    expect(onBook).toHaveBeenCalledTimes(1);
  });

  it("shows the bill first: one line above, an unknown venue in amber, and Bani's question under the card", () => {
    const review = { number: "1", date: "2026-11-27", due: "", venue: "", venues: ["ARKA", "Assembly"], terms: "", total: 300, newVendor: false, saving: false,
      intro: "Masterly for HK$300.00. Fill in the amber parts, then book.",
      lines: [{ line_no: 1, description: "Pest control", amount: 300, account_id: "c" as string | null }],
      accounts: [{ id: "c", code: "6310", name: "Cleaning", group: "Running costs" }],
      onField: vi.fn(), onAccount: vi.fn(), onBook: vi.fn(), onHold: vi.fn() };
    const { container } = render(<ChatBillCard {...booked} said={["This could be shared between venues."]} canUndo={false} phase="review" vendor="Masterly" review={review} />);
    expect(screen.getByText("● Pick the venue")).toBeTruthy();
    expect((screen.getByText(/^Book HK/) as HTMLButtonElement).disabled).toBe(true);
    const text = container.textContent ?? "";
    expect(text.indexOf("Fill in the amber parts")).toBeLessThan(text.indexOf("Bill no."));
    expect(text.indexOf("This could be shared")).toBeGreaterThan(text.indexOf("Hold for review"));
  });

  it("hides Undo when the bill can't be undone", () => {
    render(<ChatBillCard {...booked} canUndo={false} />);
    expect(screen.queryByText("Undo")).toBeNull();
    expect(screen.getByText("See bill")).toBeTruthy();
  });

  it("tells a person who can't approve that it went to an approver", () => {
    render(<ChatBillCard {...booked} phase="sent" canUndo={false} />);
    expect(screen.getByText("Sent to an approver. You can't book this one yourself.")).toBeTruthy();
  });

  it("adds a cash-box slip only with a box and category, after a confirm", () => {
    const onAdd = vi.fn();
    const slip = { phase: "ready" as const, description: "Wellcome", date: "2026-11-18", amount: 186.5, currency: "HKD", classifications: [{ id: "k1", name: "Cleaning" }],
      floats: [{ id: "f1", name: "Assembly", venue: "Assembly" }, { id: "f2", name: "Caliente", venue: "Caliente" }], saving: false, onClassification: vi.fn(), onFloat: vi.fn(), onOpenFull: vi.fn() };
    const { rerender } = render(<ChatCashSlipCard {...slip} classificationId="k1" floatId="" onAdd={onAdd} />);
    expect((screen.getByText("Add") as HTMLButtonElement).disabled).toBe(true);
    rerender(<ChatCashSlipCard {...slip} classificationId="k1" floatId="f1" onAdd={onAdd} />);
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(cashSlipProblem({ float_id: "f1", receipt_date: "2026-11-18", amount: 0, description: "x", classification_id: "k1" })).toMatch(/Amount/);
  });

  it("shares one path with the full screens and never posts from chat", () => {
    const host = readFileSync("src/components/assistant/ChatExpenseScan.tsx", "utf8");
    expect(host).toContain("saveBill(");
    expect(host).not.toMatch(/postBill|findRegularCost|billNeedsFullScreen/);
    expect(host).toContain('setStatus(id, "approved")');
    expect(host).toContain('setStatus(s.billId, "void")');
    expect(host).toContain('area: "expenses"');
    expect(host).toContain("insertPendingCashSlip(");
    expect(host).toContain("isAdmin && !isPreviewActive");
    expect(readFileSync("src/pages/finance/BillsExpenses.tsx", "utf8")).toContain("billDraftFromScan(");
    expect(readFileSync("src/components/finance/bills/BillDropZone.tsx", "utf8")).toContain("readBillFiles(");
    expect(readFileSync("src/components/petty-cash/PettyCashImport.tsx", "utf8")).toContain("insertPendingCashSlip(");
    expect(readFileSync("src/utils/cashSlip.ts", "utf8")).toContain('status: "pending"');
    const server = readFileSync("supabase/functions/chat-assistant/floatingFiles.ts", "utf8");
    expect(server).toContain('name: "open_expense_scanner"');
    expect(server).not.toContain("expense slips cannot be filed from here yet");
  });
});
