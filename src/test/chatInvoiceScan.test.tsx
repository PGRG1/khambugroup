import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChatScanCard, heldForCounts, lineSettled, type ChatScanLine } from "@/components/invoices/ChatScanCard";

const lines: ChatScanLine[] = [
  { key: "a", index: 0, name: "Tiger prawns", billed: 4, accepted: 4, unit: "kg", total: 1120, price: 280 },
  { key: "b", index: 2, name: "Squid", billed: 8, accepted: 8, unit: "kg", total: 1040, price: 130 },
];
const base = { supplier: "Sun Kee Seafood", number: "INV-1", date: "2026-11-18", total: 2160, currency: "HKD", lines, termsDays: 30, printedDue: null, saving: false };
const fns = () => ({ onField: vi.fn(), onQty: vi.fn(), onReason: vi.fn(), onBook: vi.fn(), onOpenFull: vi.fn() });
const book = () => screen.getByRole("button", { name: "Book" }) as HTMLButtonElement;

describe("Bani chat invoice booking", () => {
  it("needs every line ticked, then a confirm, before booking", () => {
    const f = fns();
    render(<ChatScanCard {...base} phase="ready" {...f} />);
    expect(book().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Tiger prawns arrived"));
    expect(book().disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Squid arrived"));
    fireEvent.click(book());
    expect(f.onBook).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Book"));
    expect(f.onBook).toHaveBeenCalledWith(expect.objectContaining({ dueDate: "2026-12-18", paid: false, hold: false }));
  });

  it("never books a line that can't go into the books, but still allows Hold", () => {
    const f = fns();
    render(<ChatScanCard {...base} lines={[{ ...lines[0], blocked: "Seafood has no account at Caliente" }, lines[1]]} phase="ready" {...f} />);
    fireEvent.click(screen.getByText("Tick all"));
    expect(screen.getByText("Seafood has no account at Caliente")).toBeTruthy();
    expect(screen.getByText(/Can't go into the books yet/)).toBeTruthy();
    expect(book().disabled).toBe(true);
    expect((screen.getByText("Hold for review") as HTMLButtonElement).disabled).toBe(false);
  });

  it("reasons match the journal rebuild's holds", async () => {
    const { notBookableText } = await import("@/utils/notBookable");
    expect(notBookableText({ problem: "account", category: "Fruit" }, "Caliente")).toBe("Fruit has no account at Caliente");
    expect(notBookableText({ problem: "group", category: "" }, "Caliente")).toBe("Item has no group");
    expect(notBookableText({ problem: "unchecked", category: "" }, "")).toBe("Couldn't check the books");
  });

  it("Tick all, and Hold for review saves as a held draft", () => {
    const f = fns();
    render(<ChatScanCard {...base} phase="ready" {...f} />);
    fireEvent.click(screen.getByText("Tick all"));
    fireEvent.click(screen.getByText("Hold for review"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Hold"));
    expect(f.onBook).toHaveBeenCalledWith(expect.objectContaining({ hold: true, paid: false }));
  });

  it("changes the received quantity of the real scanner line", () => {
    const f = fns();
    render(<ChatScanCard {...base} phase="ready" {...f} />);
    fireEvent.click(screen.getByLabelText("Change Squid received"));
    fireEvent.click(screen.getByLabelText("Less Squid"));
    expect(f.onQty).toHaveBeenCalledWith(2, 7);
  });

  it("a changed count needs a reason, and Other needs a note", () => {
    const short = { ...lines[1], accepted: 7 };
    expect(lineSettled(short)).toBe(false);
    expect(lineSettled({ ...short, reason: "short_delivery" })).toBe(true);
    expect(lineSettled({ ...short, reason: "other" })).toBe(false);
    expect(lineSettled({ ...short, reason: "other", note: "Crate cracked" })).toBe(true);
    expect(heldForCounts([lines[0], short])).toBe(130);
  });

  it("shows Bani's price check without letting the receiver change price", () => {
    render(<ChatScanCard {...base} lines={[{ ...lines[0], was: 275 }, lines[1]]} phase="ready" {...fns()} />);
    expect(screen.getByText("Was 275.00")).toBeTruthy();
    expect(screen.getByText("1 price up")).toBeTruthy();
  });

  it("sends anything unclear to the full review and never offers Book", () => {
    const f = fns();
    render(<ChatScanCard {...base} phase="review" {...f} />);
    expect(screen.queryByRole("button", { name: "Book" })).toBeNull();
    fireEvent.click(screen.getByText("Open full review"));
    expect(f.onOpenFull).toHaveBeenCalled();
  });

  it("books through the one scanner save path; hold is a draft", () => {
    const chat = readFileSync("src/components/assistant/ChatInvoiceScan.tsx", "utf8");
    expect(chat).toContain("saveScannerInvoice(");
    expect(readFileSync("src/components/procurement/ProcurementInvoicesTab.tsx", "utf8")).toContain("saveScannerInvoice(");
    expect(readFileSync("src/utils/autoCreateGrnFromInvoice.ts", "utf8")).toMatch(/opts\.receivedDate && \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test/);
    const scanner = readFileSync("src/components/invoices/InvoiceScanner.tsx", "utf8");
    expect(scanner).toContain('answers.hold ? "under_review"');
    expect(scanner).toContain("RECEIVING_REASONS.some(r => r.value === reason)");
  });
});
