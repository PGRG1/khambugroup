export interface EvidenceBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type EvidenceField = "supplier_name" | "venue" | "invoice_number" | "invoice_date" | "due_date" | "total_amount" | "item_code" | "description" | "quantity" | "unit" | "unit_price" | "discount" | "total";

export interface InvoiceEvidenceMap {
  header: Partial<Record<EvidenceField, EvidenceBox>>;
  lines: Array<Partial<Record<EvidenceField, EvidenceBox>>>;
}

const HEADER_FIELDS = new Set<EvidenceField>([
  "supplier_name", "venue", "invoice_number", "invoice_date", "due_date", "total_amount",
]);
const LINE_FIELDS = new Set<EvidenceField>([
  "item_code", "description", "quantity", "unit", "unit_price", "discount", "total",
]);

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function normalizeEvidenceBox(value: unknown, maxPage = Number.MAX_SAFE_INTEGER): EvidenceBox | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!finite(candidate.page) || !finite(candidate.x) || !finite(candidate.y) || !finite(candidate.width) || !finite(candidate.height)) return null;
  const page = Math.round(candidate.page);
  if (page < 1 || page > maxPage || candidate.width <= 0 || candidate.height <= 0) return null;
  const x = clamp(candidate.x);
  const y = clamp(candidate.y);
  const right = clamp(candidate.x + candidate.width);
  const bottom = clamp(candidate.y + candidate.height);
  if (right <= x || bottom <= y) return null;
  return { page, x, y, width: right - x, height: bottom - y };
}

function normalizeFieldRecord(value: unknown, allowed: Set<EvidenceField>, maxPage: number): Partial<Record<EvidenceField, EvidenceBox>> {
  if (!value || typeof value !== "object") return {};
  const result: Partial<Record<EvidenceField, EvidenceBox>> = {};
  for (const [field, box] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(field as EvidenceField)) continue;
    const normalized = normalizeEvidenceBox(box, maxPage);
    if (normalized) result[field as EvidenceField] = normalized;
  }
  return result;
}

export function normalizeInvoiceEvidence(value: unknown, maxPage = Number.MAX_SAFE_INTEGER): InvoiceEvidenceMap {
  if (!value || typeof value !== "object") return { header: {}, lines: [] };
  const candidate = value as Record<string, unknown>;
  const rawLines = Array.isArray(candidate.lines) ? candidate.lines : [];
  return {
    header: normalizeFieldRecord(candidate.header, HEADER_FIELDS, maxPage),
    lines: rawLines.map((line) => normalizeFieldRecord(line, LINE_FIELDS, maxPage)),
  };
}

export function resolveEvidenceBox(evidence: InvoiceEvidenceMap | null | undefined, activeKey: string | null | undefined): EvidenceBox | null {
  if (!evidence || !activeKey) return null;
  if (HEADER_FIELDS.has(activeKey as EvidenceField)) return evidence.header[activeKey as EvidenceField] ?? null;
  const match = /^line-(\d+)-([a-z_]+)$/.exec(activeKey);
  if (!match) return null;
  const lineIndex = Number(match[1]);
  const field = match[2] as EvidenceField;
  if (!LINE_FIELDS.has(field) || !evidence.lines[lineIndex]) return null;
  return evidence.lines[lineIndex][field] ?? null;
}

export function getEvidenceLabel(activeKey: string | null | undefined): string {
  if (!activeKey) return "Document";
  const line = /^line-(\d+)-([a-z_]+)$/.exec(activeKey);
  const field = line ? line[2] : activeKey;
  const labels: Record<string, string> = {
    supplier_name: "Supplier",
    venue: "Venue",
    invoice_number: "Invoice #",
    invoice_date: "Invoice date",
    due_date: "Due date",
    total_amount: "Total",
    item_code: "Item code",
    description: "Description",
    quantity: "Quantity",
    unit: "Unit",
    unit_price: "Unit price",
    discount: "Discount",
    total: "Line total",
  };
  return line ? `Line ${Number(line[1]) + 1} · ${labels[field] ?? field.replace(/_/g, " ")}` : labels[field] ?? field.replace(/_/g, " ");
}

export function getEvidencePage(box: EvidenceBox | null | undefined): number | null {
  return box?.page ?? null;
}
