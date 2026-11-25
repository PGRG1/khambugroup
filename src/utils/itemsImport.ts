/** Reads the Items Master upload template (sheet "Items") into rows for the import_items server check. */
export type ImportRow = {
  row: number; name: string; category: string; stock_unit: string; supplier: string; supplier_code: string;
  supplier_item_name: string; purchase_unit: string; per_purchase: string; price: string; recipe_unit: string;
  recipe_per_stock: string; counts_as_stock: string; sku: string; purchase_yield: string; cooking_yield: string;
  min_stock: string; reorder: string; status: string; notes: string;
};

const HEADERS: Record<string, keyof ImportRow> = {
  "item name": "name", "category": "category", "stock unit": "stock_unit", "supplier": "supplier",
  "supplier code": "supplier_code", "supplier's item name": "supplier_item_name", "suppliers item name": "supplier_item_name",
  "purchase unit": "purchase_unit", "stock units per purchase unit": "per_purchase", "price per purchase unit": "price",
  "recipe unit": "recipe_unit", "recipe units per stock unit": "recipe_per_stock", "counts as stock": "counts_as_stock",
  "internal sku": "sku", "sku": "sku", "purchase yield %": "purchase_yield", "cooking yield %": "cooking_yield",
  "min stock": "min_stock", "reorder qty": "reorder", "status": "status", "notes": "notes",
};
const REQUIRED: (keyof ImportRow)[] = ["name", "category", "stock_unit", "supplier", "purchase_unit", "per_purchase", "price", "counts_as_stock"];
export const MAX_IMPORT_ROWS = 5000;

const norm = (h: unknown) => String(h ?? "").replace(/\*/g, "").replace(/[’`]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const text = (v: unknown) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

export type ParsedSheet = { rows: ImportRow[]; error?: string };

/** `data` is the sheet as rows of cells, header first. Blank rows and the template's example row are skipped. */
export function parseItemsSheet(data: unknown[][]): ParsedSheet {
  if (!data.length) return { rows: [], error: "The file is empty." };
  const header = data[0].map(norm);
  const index: Partial<Record<keyof ImportRow, number>> = {};
  header.forEach((h, i) => { const key = HEADERS[h]; if (key && index[key] === undefined) index[key] = i; });
  const missing = REQUIRED.filter(k => index[k] === undefined);
  if (missing.length) return { rows: [], error: "This isn't the Items template: some columns are missing. Download the template and copy your rows into it." };
  const rows: ImportRow[] = [];
  data.slice(1).forEach((cells, i) => {
    const get = (k: keyof ImportRow) => (index[k] === undefined ? "" : text(cells[index[k] as number]));
    const row = { row: i + 2 } as ImportRow;
    (Object.keys(HEADERS) as string[]).forEach(h => { const k = HEADERS[h]; if (k !== "row") (row as any)[k] = get(k); });
    const filled = (Object.keys(row) as (keyof ImportRow)[]).some(k => k !== "row" && k !== "status" && String(row[k]).trim() !== "");
    if (!filled) return;
    if (/^example row/i.test(row.notes)) return;
    if (!row.status) row.status = "Active";
    rows.push(row);
  });
  if (!rows.length) return { rows, error: "No rows to upload." };
  if (rows.length > MAX_IMPORT_ROWS) return { rows: [], error: `Upload at most ${MAX_IMPORT_ROWS.toLocaleString()} rows at a time.` };
  return { rows };
}
