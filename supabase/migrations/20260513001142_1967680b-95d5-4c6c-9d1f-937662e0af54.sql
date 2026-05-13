ALTER TABLE public.payment_processor_fee_rates
ADD COLUMN IF NOT EXISTS rounding_method text NOT NULL DEFAULT 'normal';

ALTER TABLE public.payment_processor_fee_rates
DROP CONSTRAINT IF EXISTS payment_processor_fee_rates_rounding_method_check;

ALTER TABLE public.payment_processor_fee_rates
ADD CONSTRAINT payment_processor_fee_rates_rounding_method_check
CHECK (rounding_method IN ('normal','round_up','round_down','truncate'));