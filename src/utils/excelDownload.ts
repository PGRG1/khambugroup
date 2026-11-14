/** Build an .xlsx from a header row + data rows. The library loads only when someone downloads. */
export async function downloadExcel(headers: string[], rows: (string | number | null)[][], fileName: string, sheet = "Sheet1") {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const data = [
    headers.map((h) => ({ value: h, fontWeight: "bold" as const })),
    ...rows.map((r) => r.map((v) => (v === null || v === "" || (typeof v === "number" && !Number.isFinite(v)) ? null : { value: v }))),
  ];
  const columns = headers.map((h, i) => ({ width: Math.min(28, Math.max(10, h.length + 2, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2))) }));
  const blob = await writeExcelFile(data as any, { columns, stickyRowsCount: 1, sheet } as any).toBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
