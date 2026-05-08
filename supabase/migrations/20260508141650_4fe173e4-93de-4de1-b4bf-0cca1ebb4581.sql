UPDATE payment_settlement_transactions SET payment_method_key='wechat_pay' WHERE FALSE;
UPDATE payment_settlement_transactions t
SET wallet_type = v.wt
FROM (VALUES
('2026-04-30 01:03:00+00'::timestamptz, 836.0, '852124709700001', 'WeChatCN'),
('2026-04-29 00:35:00+00'::timestamptz, 429.0, '852124709700001', 'WeChatCN'),
('2026-04-29 00:03:00+00'::timestamptz, 578.0, '852124709700001', 'WeChatCN'),
('2026-04-28 00:41:00+00'::timestamptz, 727.0, '852124709700001', 'WeChatCN'),
('2026-04-27 23:48:00+00'::timestamptz, 315.0, '852124709700001', 'WeChatHK'),
('2026-04-27 01:17:00+00'::timestamptz, 725.0, '852124709700001', 'WeChatCN'),
('2026-04-27 00:02:00+00'::timestamptz, 418.0, '852124709700001', 'WeChatCN'),
('2026-04-26 00:22:00+00'::timestamptz, 410.0, '852124709700001', 'WeChatCN'),
('2026-04-25 02:59:00+00'::timestamptz, 451.0, '852124709700001', 'WeChatCN'),
('2026-04-22 21:19:00+00'::timestamptz, 222.0, '852124709700001', 'WeChatCN'),
('2026-04-21 23:52:00+00'::timestamptz, 143.0, '852124709700001', 'WeChatCN'),
('2026-04-21 23:25:00+00'::timestamptz, 320.0, '852124709700001', 'WeChatCN'),
('2026-04-20 21:53:00+00'::timestamptz, 200.0, '852124709700001', 'WeChatCN'),
('2026-04-20 20:33:00+00'::timestamptz, 114.0, '852124709700001', 'WeChatCN'),
('2026-04-18 23:50:00+00'::timestamptz, 251.0, '852124709700001', 'WeChatCN'),
('2026-04-18 01:32:00+00'::timestamptz, 343.0, '852124709700001', 'WeChatCN'),
('2026-04-17 00:00:00+00'::timestamptz, 766.0, '852124709700001', 'WeChatCN'),
('2026-04-16 00:00:00+00'::timestamptz, 270.0, '852124709700001', 'WeChatCN'),
('2026-04-15 22:52:00+00'::timestamptz, 242.0, '852124709700001', 'WeChatCN'),
('2026-04-11 00:01:00+00'::timestamptz, 858.0, '852124709700001', 'WeChatCN'),
('2026-04-10 00:26:00+00'::timestamptz, 1153.0, '852124709700001', 'WeChatCN'),
('2026-04-05 00:36:00+00'::timestamptz, 248.0, '852124709700001', 'WeChatCN'),
('2026-04-04 19:07:00+00'::timestamptz, 542.0, '852124709700001', 'WeChatHK'),
('2026-04-02 23:10:00+00'::timestamptz, 572.0, '852124709700001', 'WeChatCN'),
('2026-04-28 21:14:00+00'::timestamptz, 838.0, '852124661800002', 'WeChatCN'),
('2026-04-24 21:15:00+00'::timestamptz, 891.0, '852124661800002', 'WeChatCN')
) AS v(ts, gross, mn, wt)
WHERE t.transaction_time = v.ts
  AND t.gross_amount = v.gross
  AND t.merchant_number = v.mn
  AND t.payment_method_key = 'wechat'
  AND t.wallet_type IS NULL;