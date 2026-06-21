## Seed YeahPay Processor Fee Rates

YeahPay already exists as a processor but has **0 fee rules configured**, which is why nothing shows on the Fee Rates tab when you pick it. I'll seed it now using KPay's structure as the template, with the two overrides you specified.

### What gets inserted into `payment_processor_fee_rates` for YeahPay

| Payment method | Locality | Merchant # | Rate | Notes |
|---|---|---|---|---|
| visa | domestic | (all) | **1.50%** | Visa domestic, all stores |
| visa_foreign | foreign | (all) | 3.00% | Visa Foreign Card |
| mastercard | domestic | (all) | **1.50%** | Mastercard domestic, all stores |
| mastercard_foreign | foreign | (all) | 3.00% | Mastercard Foreign Card |
| amex | domestic | (all) | 1.50% | Amex domestic |
| amex_foreign | foreign | (all) | 3.00% | Amex Foreign |
| union_pay | domestic | (all) | 1.80% | China UnionPay |
| UnionPay QuickPass | domestic | (all) | 1.80% | |
| alipay | any | (all) | 1.20% | Alipay HK + CN |
| wechat | any | (all) | 1.20% | WeChat Pay |
| payme | any | (all) | 1.10% | PayMe |

All rows: `rounding_dp = 2`, `rounding_method = normal`, `effective_from = 2000-01-01`, `merchant_number = NULL` (terminals to be added by you later from the Merchants tab).

### Difference vs KPay
- Visa & Mastercard are flat **1.50% across all venues** (KPay had a 2.60% Assembly Mastercard split — not replicated for YeahPay per your instruction).
- No per-venue merchant numbers seeded (you'll add later).

### Out of scope
- No UI changes — the Payments & Settlements page already lists YeahPay and will show these 11 rows immediately after insert.
- No journal logic changes — `payment_settlement_clearing|<venue>` mapping already handles YeahPay since it's just another non-cash method.
- No KPay edits.

### How it runs
One `INSERT` into `payment_processor_fee_rates` (11 rows) scoped to YeahPay's `processor_id`. Idempotent guard: skip insert if YeahPay already has rates, so re-running is safe.
