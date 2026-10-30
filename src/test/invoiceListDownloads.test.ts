import { describe, expect, it } from "vitest";
import { invoiceDownloadFiles } from "@/utils/invoiceListDownloads";

const invoices = [
  { id: "a", invoice_number: "A", file_url: "tenant/a.pdf, tenant/a-2.jpg", file_name: "a.pdf" },
  { id: "b", invoice_number: "B", file_url: "tenant/b.pdf", file_name: "original.pdf" },
];

describe("Invoice file download scope", () => {
  it("downloads every attachment of selected rows only", () => {
    expect(invoiceDownloadFiles(invoices, new Set(["a"])).map(file => file.path)).toEqual(["tenant/a.pdf", "tenant/a-2.jpg"]);
  });
  it("downloads all filtered rows when none are selected", () => {
    expect(invoiceDownloadFiles(invoices, new Set()).map(file => file.path)).toEqual(["tenant/a.pdf", "tenant/a-2.jpg", "tenant/b.pdf"]);
  });
  it("does not let selection outside the filters widen the download scope", () => {
    expect(invoiceDownloadFiles([invoices[1]], new Set(["a"]))).toEqual([{ path: "tenant/b.pdf", name: "original.pdf" }]);
  });
});