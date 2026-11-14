# Smooth loading, pass 1

Goal: sign-in to Home feels like one continuous transition. Acceptance rule: after Home's first painted frame, nothing moves or resizes and no text is swapped for different text. Only fades and transforms are allowed. With reduced motion, everything just appears.

## Files to change
- `src/App.tsx`: TenantShell, ProtectedRoute, QuietLoading
- `src/pages/Auth.tsx`: hold the button until the destination is known
- `src/utils/authRoute.ts` (wherever `resolveAuthRoute` lives): reuse it in Auth, no new rules
- `src/pages/Landing.tsx` and `src/pages/landing2.css`: greeting, team line, slot, skeletons, reveal
- `src/components/assistant/FloatingBani.tsx` and `FloatingBaniContext.tsx`: slot registration, crossfade, queued focus
- New `src/components/assistant/HomeComposerPlaceholder.tsx`: markup and classes shared with the real composer
- `src/components/AppSidebar.tsx`: same name cache, no email fallback (it uses the same `email.split("@")` fallback)
- Platform Clients page (stat tiles)
- `src/components/home/WorkLog.tsx` and a new `src/utils/workLogLinks.ts`, plus a test
- `src/test/`: tests for the cached name, the work-log links, and the last-decision helper

## 1. Keep the frame on screen
- TenantShell and ProtectedRoute: replace "Checking access…" with `<div aria-busy className="min-h-[calc(100dvh-52px)]" />`. It shows no text. Keeping the previous page (the Outlet) on screen is not safe, because it could briefly show a page the person just lost access to. So: an empty area, not the previous content.
- First decision: save `bani-last-shell = tenant|platform` once a decision is made. If it is `tenant`, render a static `ShellFrame` (sage background, 52px top bar, sidebar-width column on desktop, no data, no links) instead of the blank screen. Platform admins and first-time visitors keep the plain screen. On sign-out, clear the saved value.
- Auth: after `signIn` succeeds, wait for the session and the platform-admin check. Then call `resolveAuthRoute` and `navigate(to, {replace:true})` straight to `/platform/clients` or `/`. The button stays on "Please wait…" until then. This needs a small `waitForAccess()` built on the existing hooks or a direct `is_platform_admin` call; I'll reuse whichever the platform-admin check already uses.

## 2. Greeting name
- Delete the email-prefix fallback (`user.email.split("@")[0]`) in Landing, AppSidebar and `Home.tsx:387`.
- Cache in `localStorage["bani-display-name-<userId>"]`: read it on first render and update it after the profile loads. If the name changes, the new name fades in once. That is the only exception to "no text replaced", and it only happens after the user is renamed.
- No cache: render "Good afternoon" followed by an inline `<span>` that fades in when the name arrives (opacity 250ms). Left-aligned on phone, so nothing shifts.
- Preview-as: use the previewed person's cache key, never the admin's.

## 3. Team line
- `.l2-team { height:26px }` at all widths. The status slot is a fixed-width inline box (`min-width` measured from "handled 99 things this week →"), so the line keeps its size whether it is empty or filled.
- Remove "is catching up". While pending, the slot is empty. When the count lands, it fades in once. The "nothing new" text also fades in once, into the same slot.
- Delete the `l2teamCycle`, `l2words` and infinite `l2sheen` animations. New one-time entrance: avatars scale from .4 to 1 with `cubic-bezier(.34,1.56,.64,1)`, 500ms, 70ms stagger, then stay. "Your finance team" is always visible, with one sheen pass on entry. Per the home-team-motion memory ("continuous avatars"), this replaces the loop the user asked for earlier; I'm treating this spec as superseding it and will update that memory.

## 4. Chat bar from the first frame
- Measure: a Playwright script at 390x844 and 1280x1800 reads `getBoundingClientRect().height` of the mounted home composer, including the "Your chats" row, in both states (with saved chats, and with none). Set `.l2-askslot` min-height to those values per breakpoint, as CSS custom properties in `landing2.css`.
- Risk: the "Your chats" row only exists when a person has saved chats. Fix: always reserve the row's height. The row is empty for new users, so a later "Your chats" appearance never pushes the page.
- Placeholder: `HomeComposerPlaceholder` uses the real composer's classes, so the two can't drift apart. It shows the "Your chats" row, 40px pill, "+", hint, mic and voice, `aria-hidden` and `inert` except for one tap target. Tapping it sets `pendingFocus` in the context. FloatingBani focuses its input on mount if that flag is set. Crossfade: the placeholder is absolutely positioned under the real one, and the real one fades from 0 to 1 over 200ms before the placeholder is removed.
- Replace the body MutationObserver in `useHomeSlot` with `registerHomeSlot(el)` in FloatingBaniContext, passed by Landing as a callback ref (`null` on unmount).

## 5. Snapshot and work cards
- Measure the loaded `.l2-snap` and `.l2-work` heights the same way, at phone (single column) and desktop (3 columns), and lock them as `min-height` per breakpoint. Skeletons get the same box.
- Gate: one `ready` boolean per block (all of the block's queries settled). Inside a block, no value renders early, so "…" placeholders go away. One reveal per block: opacity plus `translateY(6px→0)`, 320ms, `cubic-bezier(.2,.8,.2,1)`.
- Risk: these are min-heights. If real content grows (longer venue names, a wrapped label, larger system font), it can still push the page. To reduce this, labels get `line-clamp:1` / ellipsis wherever the design already truncates.

## 6. Platform Clients stats
- While the data loads, the four tiles show a neutral bar (same height as the number), not 0. All four values fade in together.

## 7. "What we did" list (WorkLog)
- New `workLogLinks.ts` maps each row to its exact destination, plus an access check:
  - Invoice: its review screen (I'll confirm the existing deep-link parameter before wiring)
  - Sales: `/sales-data/:id` (route exists)
  - Bill: its Expenses record (I'll confirm the deep-link parameter; otherwise `/expenses` plus a record query parameter handled where the list already opens details)
  - Bank line: `/finance/cash` with the line highlighted, if Cash & bank supports it
  - Month-end: `/finance/close?month=YYYY-MM`; payroll accruals go to `/hr/payroll`
- "Checks" rows stop linking to `/your-team`. They expand inline in the dialog to show their findings, each with "Ask Bani". That action opens FloatingBani with a prefilled message and does not navigate.
- Rows go through the existing `canAccessPage` / admin checks. If the person can't open the destination, the row is plain text, not a link.
- Not confirmed yet: whether invoice, bill and bank screens already accept a record ID in the URL. Step one is checking each. If a screen doesn't, adding a read-only "open this record" parameter there is in scope. Otherwise the row links to the list for now, and I'll report that.

## Where I think the spec is wrong or risky
1. Keeping the previous content during re-checks could flash a page the person can no longer access. I'll use an empty area instead.
2. "Exact" heights from min-height can't be guaranteed when content varies. Fixed height plus clamping is safer for the team line and tiles; the cards keep min-height plus truncation.
3. The "Your chats" row is conditional, so its space must be reserved always, or the jump comes back for new users.
4. The per-user name cache is stored on the device in localStorage. That's fine for a display name, but it must be keyed by user and never used across preview-as.
5. The 0.3–0.4s route freezes are likely long synchronous renders or bundle loading, which belong to the later code-splitting pass. This pass won't fix them.
6. The infinite team-motion loop was requested earlier; this replaces it, and I'll update that memory accordingly.

## Verification
- Playwright on phone and desktop with a signed-in session: record element rectangles every frame from first paint until data settles, and assert no top/height changes and no text changes beyond the allowed one-time fades. Repeat with reduced motion emulated.
- Unit tests: name cache (no email fallback), last-shell decision, work-log link mapping and access gating.
- No database, permission or save-logic changes.
