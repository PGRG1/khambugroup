export type StatementKind = 'bank' | 'utility' | 'settlement' | 'unknown';
export function statementKind(name: string, content = ''): StatementKind {
  const text = `${name} ${content}`.toLowerCase();
  if (/kpay|yeahpay|settlement|merchant payout/.test(text)) return 'settlement';
  if (/clp|towngas|utility|electricity|water bill|gas bill/.test(text)) return 'utility';
  if (/bank|hsbc|bochk|hang seng|standard chartered/.test(text)) return 'bank';
  return 'unknown';
}
export function statementDuplicate(hash: string, hashes: string[]) { return hashes.includes(hash); }
export async function statementHash(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}