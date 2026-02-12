
-- Create sales_records table
CREATE TABLE public.sales_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date TEXT NOT NULL,
  day TEXT NOT NULL,
  venue TEXT NOT NULL CHECK (venue IN ('Assembly', 'Caliente')),
  report_number TEXT NOT NULL,
  orders INTEGER NOT NULL DEFAULT 0,
  guests INTEGER NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  service_charge NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total_sales NUMERIC NOT NULL DEFAULT 0,
  visa NUMERIC NOT NULL DEFAULT 0,
  mastercard NUMERIC NOT NULL DEFAULT 0,
  amex NUMERIC NOT NULL DEFAULT 0,
  union_pay NUMERIC NOT NULL DEFAULT 0,
  alipay NUMERIC NOT NULL DEFAULT 0,
  wechat NUMERIC NOT NULL DEFAULT 0,
  cash NUMERIC NOT NULL DEFAULT 0,
  card_tips NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date, venue, report_number)
);

-- Enable RLS
ALTER TABLE public.sales_records ENABLE ROW LEVEL SECURITY;

-- Allow public read/write (no auth in this app currently)
CREATE POLICY "Allow public read" ON public.sales_records FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.sales_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.sales_records FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.sales_records FOR DELETE USING (true);
