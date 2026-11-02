# Smart Alerts inbox
- useSmartAlerts owns identity-scoped reads and explicit guarded lifecycle/mute actions; preview mode is read-only to prevent acting as another user.
- All tenant pages mount one AlertsPanel in AppLayout; popovers/dialogs use solid light semantic tokens and phone sheet presentation.
- Settings uses tenant-scoped alert_settings and confirmed alert_asks; legacy alert_rules is read-only. Summary is distinct from personal mutes and coverage/confidence must stay factual.