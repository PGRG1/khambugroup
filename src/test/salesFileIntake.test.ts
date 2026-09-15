import { describe, expect, it } from "vitest";
import {
  classifySalesFile,
  fileExtension,
  parseDelimitedText,
} from "@/utils/salesFileIntake";
import { parseExcelRow } from "@/utils/salesUtils";

describe("classifySalesFile", () => {
  it("routes spreadsheets", () => {
    expect(classifySalesFile({ name: "pos.xlsx" })).toBe("excel");
    expect(classifySalesFile({ name: "pos.XLS" })).toBe("excel");
  });

  it("routes csv separately from excel", () => {
    expect(classifySalesFile({ name: "pos.csv" })).toBe("csv");
    expect(classifySalesFile({ name: "export", type: "text/csv" })).toBe("csv");
  });

  it("routes pdf and images to the scan branch", () => {
    for (const n of ["r.pdf", "r.jpg", "r.jpeg", "r.png", "r.webp", "r.heic"]) {
      expect(classifySalesFile({ name: n })).toBe("scan");
    }
    expect(classifySalesFile({ name: "photo", type: "image/png" })).toBe("scan");
  });

  it("rejects unknown types", () => {
    expect(classifySalesFile({ name: "notes.docx" })).toBe("unsupported");
    expect(fileExtension("a.b.CSV")).toBe("csv");
  });
});

describe("parseDelimitedText", () => {
  it("parses quoted fields, escaped quotes and CRLF", () => {
    const rows = parseDelimitedText('a,"b,c",d\r\n1,"say ""hi""",3\r\n');
    expect(rows).toEqual([
      ["a", "b,c", "d"],
      ["1", 'say "hi"', "3"],
    ]);
  });

  it("skips blank lines and detects semicolons", () => {
    expect(parseDelimitedText("a;b\n\n1;2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("feeds rows into the existing SalesRecord mapping", () => {
    const csv = [
      "Date,Day,Venue,Report,Orders,Guests,Subtotal,Service,Discount,Total,Visa,MC,Amex,UP,JCB,Alipay,WeChat,PayMe,Cash,Tips",
      "2026-05-03,Sun,Assembly,R1,10,20,1000,100,-50,1050,1050,0,0,0,0,0,0,0,0,30",
    ].join("\n");
    const rows = parseDelimitedText(csv);
    const res = parseExcelRow(rows[1], ["Assembly"]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.record.venue).toBe("Assembly");
      expect(res.record.totalSales).toBe(1050);
      expect(res.record.discount).toBe(-50);
      expect(res.record.cardTips).toBe(-30);
    }
  });

  it("rejects rows whose venue is not in the active master", () => {
    const rows = parseDelimitedText("2026-05-03,Sun,Ghost,R1,1,1,1,0,0,1,1,0,0,0,0,0,0,0,0,0");
    const res = parseExcelRow(rows[0], ["Assembly"]);
    expect(res.ok).toBe(false);
  });
});
