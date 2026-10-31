export const AI_UNAVAILABLE = "Bani couldn't check this (AI unavailable)";
export function median(values: number[]) {
  const sorted = values.filter(n => Number.isFinite(n) && n > 0).sort((a,b) => a-b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
}
export function usualAmountReason(amount: number, history: number[], expected?: number | null) {
  const usual = expected && expected > 0 ? expected : history.length >= 3 ? median(history) : null;
  if (!usual) return 'Not enough usual-amount history';
  const change = (amount - usual) / usual;
  if (Math.abs(change) <= 0.4 + 1e-10) return null;
  return `${Math.round(Math.abs(change)*100)}% ${change > 0 ? 'above' : 'below'} usual`;
}
export function postingReasons(input: {
  enabled: boolean; amount: number; limit: number | null; supplierKnown: boolean;
  documentRead: boolean; placed: boolean; balanced: boolean; duplicate: boolean;
  date: string; firstDate: string | null; today: string; closed: boolean;
  usualReason: string | null; humanCount?: boolean; conflict?: boolean; currency?: string;
}) {
  const reasons: string[] = [];
  if (!input.enabled) reasons.push('Automatic posting is off');
  if (input.limit !== null && input.amount > input.limit) reasons.push('Above your limit');
  if (!input.supplierKnown) reasons.push('New supplier');
  if (!input.documentRead) reasons.push('Document has not been read');
  if (!input.placed) reasons.push('Line not placed');
  if (!input.balanced || !Number.isFinite(input.amount) || input.amount <= 0) reasons.push('Amounts do not balance');
  if (input.duplicate) reasons.push('Possible duplicate');
  const date = new Date(`${input.date}T00:00:00Z`);
  const latest = new Date(`${input.today}T00:00:00Z`); latest.setUTCDate(latest.getUTCDate()+60);
  if (!input.firstDate || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==input.date || input.date<input.firstDate || date>latest) reasons.push('Date looks misread');
  if (input.closed) reasons.push('Period is closed');
  if (input.usualReason) reasons.push(input.usualReason);
  if (input.humanCount === false) reasons.push('Delivery needs a human count');
  if (input.conflict) reasons.push('Which correction is right?');
  if (input.currency && input.currency !== 'HKD') reasons.push('Currency needs checking');
  return reasons;
}