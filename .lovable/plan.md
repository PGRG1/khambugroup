# Use Provided Brand Image as Left Panel + New Logo

The user provided two assets:
- `image-192.png` — the full "Welcome to Bani" composition (logo, headline, tagline, feature list, dashboard mockup, mountains). This becomes **the entire left side** of the auth page — no overlay text from us.
- `image-193.png` — the new Bani logomark (navy + copper "B" with chart + road). Replaces the current logo.

## Changes

1. **Copy assets**
   - `user-uploads://image-192.png` → `src/assets/auth-hero.png` (overwrite)
   - `user-uploads://image-193.png` → `src/assets/bani-logo.png` (overwrite)

2. **Rewrite `src/pages/Auth.tsx`**
   - Left column (lg+): a single full-bleed `<img>` of `auth-hero.png` with `object-cover object-center` filling the whole panel — no text overlay, no gradient overlay, no feature list duplicated (it's already in the image).
   - Right column: form panel unchanged in structure but cleaned up:
     - Brand row above the card: new `bani-logo.png` (h-9 w-9, `object-contain`) + "Bani" wordmark.
     - Sign In card (border, rounded-2xl, shadow-xl, responsive padding).
     - Email + password inputs with leading icons, password show/hide toggle.
     - Remember me + Forgot password row.
     - Primary copper Sign In button with arrow.
     - "or" divider + Sign Up toggle.
     - Secure-access strip and "Powered by Bani" footer (using the new logo).
   - Mobile/tablet (<lg): shows the brand image as a full-width banner (`h-48 sm:h-64`) above the form so the imagery is preserved without breaking the layout.
   - Grid: `lg:grid-cols-[1.15fr_1fr] xl:grid-cols-[1.3fr_1fr]` so left side gets more room (matches the reference proportions).
   - Form logic preserved (sign in / sign up / forgot password, redirect on session).

## Files Touched

- `src/assets/auth-hero.png` (replaced with provided image)
- `src/assets/bani-logo.png` (replaced with provided logo)
- `src/pages/Auth.tsx` (rewrite layout)

No other files, no DB changes, no new dependencies.
