/**
 * Batch response alignment for the ai-classify `suggest_batch` contract.
 *
 * The model is asked to return `output_action = { items: [{ line_index, ... }] }`
 * but in practice it sometimes returns:
 *   - a bare array                       -> [ {...}, {...} ]
 *   - a single flat per-line object       -> { product_master_id, confidence }
 *   - items without `line_index`          -> [ {...}, {...} ]
 *
 * These helpers turn all of those into one aligned result per requested line.
 * When alignment cannot be established safely the item is dropped rather than
 * guessed, so rows are never silently misaligned.
 */

export interface AlignedBatchItem {
  line_index: number;
  item: any;
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Pull the raw per-line item array out of whatever shape the model returned. */
export function extractBatchItems(outputAction: unknown): any[] {
  if (Array.isArray(outputAction)) return outputAction;
  if (!isPlainObject(outputAction)) return [];
  if (Array.isArray(outputAction.items)) return outputAction.items;
  if (Array.isArray(outputAction.lines)) return outputAction.lines;
  if (Array.isArray(outputAction.results)) return outputAction.results;
  // A single flat per-line object (common when the batch had one line).
  const keys = Object.keys(outputAction);
  if (keys.length > 0) return [outputAction];
  return [];
}

/**
 * Align model items to the requested line indices.
 *
 * @param outputAction raw `output_action` from the model
 * @param lineIndices  the `line_index` values that were sent, in request order
 */
export function alignBatchResults(outputAction: unknown, lineIndices: number[]): AlignedBatchItem[] {
  const items = extractBatchItems(outputAction);
  if (items.length === 0 || lineIndices.length === 0) return [];

  const requested = new Set(lineIndices);
  const out: AlignedBatchItem[] = [];
  const used = new Set<number>();

  // Pass 1: honour explicit, valid, non-duplicate line_index values.
  const leftovers: any[] = [];
  for (const it of items) {
    const raw = isPlainObject(it) ? it.line_index : undefined;
    const idx = Number(raw);
    if (raw !== undefined && raw !== null && Number.isInteger(idx) && requested.has(idx) && !used.has(idx)) {
      used.add(idx);
      out.push({ line_index: idx, item: { ...it, line_index: idx } });
    } else {
      leftovers.push(it);
    }
  }

  // Pass 2: positional fallback — only safe when the leftover count exactly
  // matches the still-unassigned lines. Otherwise drop them (no guessing).
  if (leftovers.length > 0) {
    const free = lineIndices.filter((i) => !used.has(i));
    if (leftovers.length === free.length) {
      leftovers.forEach((it, i) => {
        const idx = free[i];
        used.add(idx);
        out.push({ line_index: idx, item: isPlainObject(it) ? { ...it, line_index: idx } : { value: it, line_index: idx } });
      });
    }
  }

  out.sort((a, b) => a.line_index - b.line_index);
  return out;
}
