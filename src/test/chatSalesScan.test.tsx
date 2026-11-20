import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { applySalesFigure, ChatSalesCard, salesCheck } from "@/components/sales/ChatSalesCard";
import { needsFullSalesReview } from "@/components/assistant/ChatSalesScan";
import { emptySalesRecord, salesRecordFromScan } from "@/utils/salesReceiptRead";

const record = { ...emptySalesRecord, date: "2026-11-14", day: "Sat", venue: "Assembly", guests: 142, subtotal: 9500, serviceCharge: 950, totalSales: 10450, visa: 5000, mastercard: 2860, cash: 1240, alipay: 890, deliveroo: 460 };
const props = { venues: ["Assembly", "Ruci"], saving: false, onVenue: vi.fn(), onRecord: vi.fn(), onOpenFull: vi.fn() };

describe("Bani chat sales receipt", () => {
  it("records only after Record and a second confirm", () => {
    const onRecord = vi.fn();
    render(<ChatSalesCard {...props} phase="ready" record={record} onRecord={onRecord} />);
    fireEvent.click(screen.getByText("Record"));
    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByText("Record"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Record"));
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it("shows only printed lines and both totals", () => {
    render(<ChatSalesCard {...props} phase="ready" record={record} />);
    expect(screen.getByText("Total sales")).toBeTruthy();
    expect(screen.getByText("Total paid")).toBeTruthy();
    expect(screen.queryByText("Amex")).toBeNull();
    expect(screen.getByText("Deliveroo")).toBeTruthy();
  });

  it("blocks Record and names the gap when payments don't add up", () => {
    const off = { ...record, cash: 1120 };
    expect(salesCheck(off)).toMatchObject({ ok: false, note: "Paid is 120.00 short of sales. Check cash.", fields: ["cash"] });
    render(<ChatSalesCard {...props} phase="ready" record={off} />);
    expect((screen.getByText("Record") as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets the person type over a figure", () => {
    const onFigure = vi.fn();
    render(<ChatSalesCard {...props} phase="ready" record={record} onFigure={onFigure} />);
    fireEvent.click(screen.getByLabelText("Change Cash"));
    const input = screen.getByLabelText("Cash");
    fireEvent.change(input, { target: { value: "1300" } });
    fireEvent.blur(input);
    expect(onFigure).toHaveBeenCalledWith("cash", "1300");
  });

  it("keeps Scan Receipt's rules when a figure changes", () => {
    expect(applySalesFigure(record, "discount", "100")).toMatchObject({ discount: -100, totalSales: 10350 });
    expect(applySalesFigure(record, "cardTips", "50").cardTips).toBe(-50);
    expect(applySalesFigure(record, "guests", "12.6").guests).toBe(13);
  });

  it("asks for the venue when the receipt's venue matched none", () => {
    const onVenue = vi.fn();
    render(<ChatSalesCard {...props} phase="ready" record={{ ...record, venue: "" }} onVenue={onVenue} />);
    fireEvent.click(screen.getByText("Ruci"));
    expect(onVenue).toHaveBeenCalledWith("Ruci");
  });

  it("sends deferred revenue and line-by-line clients to the full review", () => {
    expect(needsFullSalesReview(record)).toBe(false);
    expect(needsFullSalesReview({ ...record, vouchersSold: 200 })).toBe(true);
    expect(needsFullSalesReview({ ...record, lines: [] })).toBe(true);
  });

  it("never reassigns an unknown venue", () => {
    expect(salesRecordFromScan({ venue: "Somewhere else", date: "2026-11-14" }, ["Assembly"]).venue).toBe("");
    expect(salesRecordFromScan({ venue: "assembly", date: "2026-11-14", discount: 50 }, ["Assembly"])).toMatchObject({ venue: "Assembly", discount: -50, day: "Sat" });
  });

  it("records through the same server intake as Scan Receipt", () => {
    const chat = readFileSync("src/components/assistant/ChatSalesScan.tsx", "utf8");
    expect(chat).toContain("saveReceiptIntake(");
    expect(readFileSync("src/pages/DataPage.tsx", "utf8")).toContain("saveReceiptIntake(");
    expect(chat).toContain('isActionHidden("data.scan_receipt")');
    expect(chat).toContain("!isPreviewActive");
  });
});
