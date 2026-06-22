UPDATE public.invoice_line_items
SET accepted_qty = quantity,
    qty_difference = 0,
    receiving_reason = COALESCE(receiving_reason, 'matched')
WHERE accepted_qty IS NULL;