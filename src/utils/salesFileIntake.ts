/**
 * Unified intake routing for Sales Records → Upload Sales.
 * Decides how a dropped file should be read, and provides a proper CSV parser
 * (readXlsxFile cannot read CSV). No business logic lives here — parsed rows are
 * still mapped/validated by parseExcelRow.
 */

export type SalesFileKind = "excel" | "csv" | "scan" | "unsupported";

const EXCEL_EXT = ["xlsx", "xls"];
const SCAN_EXT = ["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"];

export const SALES_UPLOAD_ACCEPT =
  ".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.heic";

export function fileExtension(name: string): string {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function classifySalesFile(file: { name: string; type?: string }): SalesFileKind {
  const ext = fileExtension(file.name);
  const type = (file.type || "").toLowerCase();

  if (EXCEL_EXT.includes(ext)) return "excel";
  if (ext === "csv") return "csv";
  if (SCAN_EXT.includes(ext)) return "scan";

  if (type === "text/csv") return "csv";
  if (type === "application/pdf" || type.startsWith("image/")) return "scan";
  if (type.includes("spreadsheetml") || type === "application/vnd.ms-excel") return "excel";

  return "unsupported";
}

/** RFC4180-ish CSV/TSV parser: handles quoted fields, escaped quotes, CRLF. */
export function parseDelimitedText(text: string, delimiter?: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const delim = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c === "\r") {
      // ignore, handled by \n
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows
    .map((r) => r.map((v) => v.trim()))
    .filter((r) => r.some((v) => v !== ""));
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const counts: Record<string, number> = {
    ",": (firstLine.match(/,/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
