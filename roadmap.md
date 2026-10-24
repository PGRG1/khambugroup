# Roadmap

## Floating Bani prototype
- [x] Tenant launcher and modal-safe contextual panel
- [x] Guarded unsaved scanner proposals with server and host validation
- [x] 46 focused tests and real-model desktop/mobile local-draft verification; no publication

## Android voice capture stall
- [x] Bound capture, transcription, chat and playback; preserve recorded quiet speech and explicit orb send
- [x] Verify deterministic capture failures and authenticated recorded-speech stage calls; no design change or publication
- [ ] Physical Samsung Chrome/Lovable preview confirmation — requires the user's device

## Approved Bani voice screens and audible latency pass
- [x] Match expanded/collapsed reference on /assistant only; preserve typing, mute, transcript and session
- [x] Measure authenticated before/after acknowledgement, answer and playback timings; remove serial summary call and artificial text delays
- [x] Verify cancellation, pending audio, typed turns, gestures and mobile/desktop appearance; no publication
- [x] Use the existing reasoning turn to choose conversation, clarification or lookup; verify real multi-turn tool routing and spoken events
- [ ] Actual Android/iPhone speaker, microphone, browser speech and echo behaviour — requires physical devices; headless media playback is not hardware verification

## Bani two-way voice conversation
- [x] Built and deployed (bani-stt, bani-tts, chat-assistant voice events, useVoiceConversation hook, voice panel)
- [x] Fixed silent playback: HTMLAudioElement + WAV blob instead of WebAudio (iPhone silent switch mutes WebAudio); verified 3 full loops in browser test
- [ ] Real iPhone microphone/earpiece behaviour — cannot be tested headless

## Revenue navigation consolidation

- [x] Single permission-aware Revenue sidebar destination and shared route-driven bar
- [x] Preserve daily forecasts, detailed targets, legacy routes and current-page queries
- [x] Five focused tests and preview build passed; baseline diff scoped to navigation and documentation; authenticated visual inspection unavailable (preview signed out)

## Invoice scanner reliability fix (complete)

- [x] 1. imageCompression preserves originals <=3200px & <=4MB; else resize 3200 @ q0.90
- [x] 2. parse-invoice Agent 1 strict monetary-row segmentation, invoice-no + venue precedence
- [x] 3. Agent 1 returns source_line_no + printed_amount; Product Master removed from extraction
- [x] 4. Agent 2 line_replacements with >=0.85 confidence + reconciliation gate (no third vision call)
- [x] 5. Shared deterministic validator (_shared/invoiceRowStructure.ts)
- [x] 6. Scanner carries printed_amount/source_line_no; matching keeps external name/SKU
- [x] 7. Migration + RPC persist the four source fields
- [x] 8. No save-time global rematch on the scanner path
- [x] 9. Printed vs calculated total mismatch blocks save (override retained)
- [x] 10. Free goods stay zero cost through GRN create/resync
- [x] 11. Jebsen regression tests; 373 tests, typecheck, build pass

## Revenue Trend forecast overlay

- [x] Extend the existing forecast overview model with complete per-day portfolio values
- [x] Overlay the shared daily forecast on Revenue Trend without another query
- [x] Run focused and full tests, type check, and production build

## Remove invoice source-location highlighting

- [x] Remove evidence-box requests and normalization from `parse-invoice`
- [x] Remove source-location overlay and field-driven highlighting from invoice review
- [x] Preserve next/previous issue navigation for rows and header fields
- [x] Update focused tests and run full validation
- [x] Redeploy `parse-invoice`

## Invoice scanner supplier naming consistency

- [x] Route every scanner link and refresh path through the shared link patch
- [x] Enforce supplier-specific Items Master names and SKUs at save time
- [x] Block linked products without an entry for the invoice supplier
- [x] Add focused regression tests and run full validation

## Scanner Items Master supplier-price synchronization

- [x] Require and verify the current supplier entry
- [x] Update supplier price and linked item cost fields together
- [x] Refresh parent data and all matching lines in the active batch
- [x] Add focused tests and run full validation

## Invoice total-mismatch dismissal

- [x] Store and audit the acknowledged printed/calculated pair
- [x] Re-block when calculated amounts change
- [x] Suppress keg-only pickup-note mismatches
- [x] Show acknowledgement feedback only for real dismissals
- [x] Keep save and override gates aligned and run full validation

## Your Finance Team v1

- [x] Locked review snapshots, accepted actions with history, schedule preferences (venue-scoped access)
- [x] Fact-based Revenue / Procurement / Accounting & cash reports + checked AI Finance Director briefing
- [x] Briefing, Team reports, Actions, Past reviews, Ask your team, automatic preparation settings
- [x] Hourly server-side scheduler with once-per-period protection

## In progress (2026-10-23)
- [x] Extend light-mode atmospheric gradient (petrol #2F5E5A / teal #4F7A73 / sage #8FAF9D → cream #F5F4F0) from Home-only to ALL tenant pages via shared AppLayout shell; frosted white cards; dark mode and platform shell untouched; remove Home-only double-stack.

- [blocked] Switch Bani AI to gemini-4-argon + gpt-6-astra: GPT-6 Astra rejects lookups on the current connection; awaiting owner decision.

## Two-way voice conversation in Bani AI — DONE 2026-10-24 (not published)
- All pieces built, deployed and function-tested; UI loop not browser-verified (no real mic in sandbox)
- [ ] Floating Bani: keep existing panel sizes (desktop min(390px,100vw-2rem) × min(620px,100dvh-6rem); mobile 100% × min(540px,100dvh-5rem)); keyboard-safe only
