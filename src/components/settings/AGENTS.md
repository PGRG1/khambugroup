# Settings architecture
- settingsNavigation.ts owns destination discovery, legacy query resolution and the existing admin/preview versus invoice-access boundary, so all Settings links reach the same focused editors without widening access.
- Focused Settings panes reuse existing hooks and RPC payloads; venue subsections are URL-addressable, and ordinary navigation never saves or alters business records.- AppSidebar delegates within-settings navigation to the Settings workspace to avoid duplicate menus.
