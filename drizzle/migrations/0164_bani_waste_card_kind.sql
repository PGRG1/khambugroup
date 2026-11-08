ALTER TABLE public.bani_pending_actions DROP CONSTRAINT IF EXISTS bani_pending_actions_kind_check;
ALTER TABLE public.bani_pending_actions ADD CONSTRAINT bani_pending_actions_kind_check CHECK (kind = ANY (ARRAY[
  'mark_closed_days','open_sales_scanner','open_invoice_scanner','people','create_alert_ask',
  'set_revenue_target','set_purchasing_budget','send_team_notification','expense_meter_coverage','log_waste'
]));