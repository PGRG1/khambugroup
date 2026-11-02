# Smart Alerts engine
- rules.ts re-exports pure detectors from _shared/smartAlerts, shared with confirmed Bani asks; index.ts reads financial sources only, never posts or repairs records. Shared tenantCurrency owns portal/server amount formatting.
- Server-only smart_alert_sync atomically dedupes and closes resolved conditions; explicit smart_alert_action owns answers and preferences.
- Scheduled calls authenticate with private database tokens; user calls revalidate tenant manager membership. Push only urgent, permission- and mute-scoped recipients.
- Coverage roots suppress unjudgeable downstream conditions; ten-item ranking sends overflow to summary. Delivery waits through tenant quiet hours and claims each per-user daily digest once.