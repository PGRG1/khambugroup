DO $patch$
DECLARE
  src text := pg_get_functiondef('public.payroll_override(uuid,uuid,text,numeric,numeric,text,bool,int4)'::regprocedure);
  marker text := 'EXECUTE format(''UPDATE public.hr_payroll SET %I=$1 WHERE id=$2 AND tenant_id=$3'',f) USING value,pid,t;';
  patched text := 'UPDATE public.hr_payroll SET adjustments_override=CASE WHEN f=''adjustments_override'' THEN value ELSE adjustments_override END,earned_salary_override=CASE WHEN f=''earned_salary_override'' THEN value ELSE earned_salary_override END,actual_overtime=CASE WHEN f=''actual_overtime'' THEN value ELSE actual_overtime END,actual_bonus=CASE WHEN f=''actual_bonus'' THEN value ELSE actual_bonus END,forecast_allowances=CASE WHEN f=''forecast_allowances'' THEN value ELSE forecast_allowances END,annual_leave_pay=CASE WHEN f=''annual_leave_pay'' THEN value ELSE annual_leave_pay END,statutory_holiday_pay=CASE WHEN f=''statutory_holiday_pay'' THEN value ELSE statutory_holiday_pay END WHERE id=pid AND tenant_id=t;';
BEGIN
  IF position(marker in src) = 0 THEN RAISE EXCEPTION 'payroll_override changed shape'; END IF;
  EXECUTE replace(src, marker, patched);
END $patch$;