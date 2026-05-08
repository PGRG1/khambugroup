-- Reclassify existing foreign American Express transactions and recompute their audit
-- using the newly-added contracted fee rates (amex 1.50% domestic, amex_foreign 3.00%).

UPDATE payment_settlement_transactions
SET payment_method_key = 'amex_foreign'
WHERE payment_method_key = 'amex' AND locality = 'foreign';

WITH r AS (
  SELECT payment_method, locality, rate
  FROM payment_processor_fee_rates
  WHERE payment_method IN ('amex','amex_foreign')
)
UPDATE payment_settlement_transactions t
SET expected_fee = ROUND((-(t.gross_amount * r.rate))::numeric, 2),
    fee_variance = ROUND((t.fee_amount - (-(t.gross_amount * r.rate)))::numeric, 2),
    audit_status = CASE
      WHEN ABS(t.fee_amount - (-(t.gross_amount * r.rate))) <= 0.01 THEN 'ok'
      ELSE 'rate_off'
    END
FROM r
WHERE t.payment_method_key = r.payment_method
  AND (t.locality = r.locality OR r.locality = 'any');