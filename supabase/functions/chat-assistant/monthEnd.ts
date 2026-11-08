// Read-only month-end checklist for Bani, from the same server month checks Home uses.
type Client = any;
export const monthEndTool = { type: 'function', function: { name: 'get_month_end_checklist', description: "The month-end checklist: which steps are done or open (sales, purchases, payroll, regular costs, bank, card payouts), with links. Use when asked what's left on month-end or to fix the checklist. For open Sales call get_missing_sales_days and offer closed-day cards or the sales scanner; for other steps inspect records or navigate_to the exact screen. Never close a month or post from here.", parameters: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM; omit for the open month' } }, additionalProperties: false } } };

const hkMonth = (offset = 0) => { const d = new Date(Date.now() + 8 * 3600000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString().slice(0, 7); };

export async function monthEndChecklist(args: any, client: Client, tenant: string) {
  const closed = await client.from('finance_closed_periods').select('month_start,reopened_at').eq('tenant_id', tenant);
  if (closed.error) throw new Error(closed.error.message);
  const isClosed = (m: string) => (closed.data ?? []).some((c: any) => String(c.month_start).startsWith(m) && !c.reopened_at);
  const month = typeof args?.month === 'string' && /^\d{4}-\d{2}$/.test(args.month) ? args.month : isClosed(hkMonth(-1)) ? hkMonth(0) : hkMonth(-1);
  if (isClosed(month)) return { month, closed: true, note: 'This month is closed and locked. Nothing to fix; reopening is owner-only on the Close screen.' };
  const { data: c, error } = await client.rpc('finance_month_checks', { p_tenant_id: tenant, p_month: `${month}-01` });
  if (error) throw new Error('Month checks unavailable: ' + error.message);
  const miss: string[] = c?.missing ?? [];
  const step = (name: string, done: boolean, detail: string, link: string, fix: string) => ({ name, state: done ? 'done' : 'open', detail, link, ...(done ? {} : { how_to_fix: fix }) });
  const current = month === hkMonth(0);
  return {
    month, closed: false, in_progress: current,
    steps: [
      step('Sales', c.sales_days > 0 && !(current), `${c.sales_days} venue-days recorded`, '/sales-data', 'Call get_missing_sales_days for this month; offer mark_closed_days cards for closed days and open_sales_scanner for days that traded.'),
      step('Purchases', !miss.includes('approved items not posted') && !miss.includes('accounts missing'), `${c.invoices} invoices${miss.includes('approved items not posted') ? ' · approved items not posted' : ''}${miss.includes('accounts missing') ? ' · accounts missing' : ''}`, '/procurement/invoices', 'inspect_records invoices/bills, then navigate_to the exact record.'),
      step('Payroll', !!c.payroll, c.payroll ? 'Run posted' : 'No posted payroll run', '/hr/payroll', current ? 'Payroll is prepared after the month ends; offer to open Payroll.' : 'navigate_to payroll; payroll approval is never done from chat.'),
      step('Regular costs', c.rent === 'complete', `Regular costs ${c.rent}`, '/expenses/recurring', 'navigate_to the regular costs screen for selected approval.'),
      step('Bank matched', c.bank_lines > 0 && c.bank_unmatched === 0, `${c.bank_lines} lines · ${c.bank_unmatched} not matched`, '/finance/cash?view=close', 'navigate_to cash to import or match statements.'),
    ],
    note: current ? 'Current month is still trading: sales days so far count, later days are not missing yet.' : 'Closing the month stays on the Close screen.',
  };
}
