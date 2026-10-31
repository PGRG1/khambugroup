export type ReadLine = { product_master_id: string | null; qty: number | null; confidence: 'sure' | 'probably' | 'cant_tell'; note: string };
export function validateStockRead(lines: ReadLine[], allowedIds: Set<string>): ReadLine[] {
  return lines.map(line => {
    if (line.product_master_id && !allowedIds.has(line.product_master_id)) return { ...line, product_master_id: null, confidence: 'cant_tell', note: `Unidentified item: ${line.note}` };
    if (line.qty == null) return { ...line, product_master_id: null, confidence: 'cant_tell', note: line.note || 'Quantity could not be determined' };
    return line;
  });
}