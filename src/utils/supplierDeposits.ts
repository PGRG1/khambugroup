export interface DepositLine {
  id: string; productId: string; name: string; unit: string; qty: number; unitCost: number;
  venue: string; receivedDate: string; invoiceId?: string | null;
}
export interface SupplierContainer {
  key: string; name: string; paid: number; returned: number; out: number; held: number;
  lines: DepositLine[];
}
/** Remove return/deposit descriptors, retaining brand, size and container variants. */
export function containerIdentity(name: string): string {
  return name.toLowerCase().replace(/\bempty\s+(?:kegs?|bottles?|crates?)\b/g, '')
    .replace(/\b(?:deposit|refund|returned?|empty|empties)\b/g, '')
    .replace(/\b(kegs?|bottles?|crates?)\b/g, word => word.replace(/s$/, ''))
    .replace(/(\d)\s+(l|ml)\b/g, '$1$2').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\bkeg\s+keg\b/g, 'keg');
}
export function buildSupplierContainers(lines: DepositLine[]): SupplierContainer[] {
  const groups = new Map<string, SupplierContainer>();
  for (const line of lines) {
    const key = containerIdentity(line.name);
    const row = groups.get(key) ?? {key, name: line.name.replace(/\b(?:deposit|refund|empty|returned)\b/gi, '').replace(/\s*[-–]\s*$/,'').replace(/^\s*[-–]\s*/,'').trim(), paid:0,returned:0,out:0,held:0,lines:[]};
    row.paid += Math.max(0,line.qty); row.returned += Math.max(0,-line.qty);
    row.out = row.paid-row.returned; row.held += line.qty*line.unitCost; row.lines.push(line);
    groups.set(key,row);
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
}