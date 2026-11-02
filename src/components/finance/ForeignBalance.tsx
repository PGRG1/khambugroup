import { useFxRate } from '@/hooks/useFxRate';
import { baseAmount, formatMoney, formatRate, getBaseCurrency } from '@/utils/money';
import { formatDate } from '@/utils/format';

/** Foreign bank account: balance in its own currency (opening + statement lines) and in base at today's rate. */
export function ForeignBalance({ account, lines }: { account: { currency: string; opening_balance?: number | null }; lines: { money_in?: number | null; money_out?: number | null }[] }) {
  const own = Number(account.opening_balance ?? 0) + lines.reduce((n, t) => n + Number(t.money_in ?? 0) - Number(t.money_out ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const fx = useFxRate(today, account.currency);
  return <div>
    <p>{formatMoney(own, account.currency)}</p>
    <p className="text-xs text-muted-foreground">{fx.isPending ? 'Checking rate…' : fx.data ? `${formatMoney(baseAmount(own, fx.data.rate), getBaseCurrency())} at ${formatRate(fx.data.rate)}${fx.data.nearest ? ` · nearest available (${formatDate(fx.data.rate_date)})` : ''}` : 'No rate yet'}</p>
  </div>;
}
