# Smart Alerts engine
- rules.ts owns pure own-normal detectors; index.ts reads financial sources only, never posts or repairs records.
- Server-only smart_alert_sync atomically dedupes and closes resolved conditions; explicit smart_alert_action owns answers and preferences.
- Scheduled calls authenticate with private database tokens; user calls revalidate tenant manager membership. Push only urgent, permission- and mute-scoped recipients.