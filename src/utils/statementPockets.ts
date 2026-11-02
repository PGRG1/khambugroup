export type PocketAccount = { id: string; account_number_last4?: string | null; currency?: string | null; bank_name?: string | null };
export type StatementPocket = { account_number?: string | null; account_number_last4?: string | null; currency?: string | null };

const up = (c: string | null | undefined, base: string) => (c || base).toUpperCase();

/**
 * The one existing account a statement pocket belongs to: same last 4 digits and same currency.
 * A saved mapping is used only when its account has that currency. Returns null when unsure — ask the user.
 */
export function matchPocket(accounts: PocketAccount[], pocket: StatementPocket, base: string, savedId?: string | null): string | null {
  const cur = up(pocket.currency, base), last4 = (pocket.account_number_last4 || '').trim();
  const saved = savedId ? accounts.find(a => a.id === savedId) : undefined;
  if (saved && up(saved.currency, base) === cur) return saved.id;
  if (!last4) return null;
  const hits = accounts.filter(a => (a.account_number_last4 || '').trim() === last4 && up(a.currency, base) === cur);
  return hits.length === 1 ? hits[0].id : null;
}

/** Group label for pockets on one statement: bank name + the statement's main account number. */
export function statementGroupLabel(bankName: string, pockets: StatementPocket[]): string {
  const main = pockets.map(p => (p.account_number || '').trim()).find(Boolean) || pockets.map(p => p.account_number_last4 || '').find(Boolean) || '';
  return [bankName.trim(), main].filter(Boolean).join(' ');
}
