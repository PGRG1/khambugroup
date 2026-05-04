# Bani-Branded Login with Generated Imagery

Rebuild `src/pages/Auth.tsx` as a polished split-screen sign-in page. **Bani is the prominent brand** — KHAMBU never appears on this page. We will also generate two custom AI images: a Bani logomark and a hero/background visual.

## Generated Assets (AI image generation)

Generated with `google/gemini-3.1-flash-image-preview` via the Lovable AI gateway and saved into `src/assets/`:

1. **`bani-logo.png`** (square, ~512×512, transparent background)
   Prompt: *"Minimal modern monogram logo, single uppercase letter 'B' rendered as two stacked rounded rectangle slabs, deep navy primary with copper-orange accent stroke, geometric, premium fintech / SaaS feel, transparent background, vector-clean edges, centered, generous padding."*

2. **`auth-hero.jpg`** (~1600×1200, photographic + abstract)
   Prompt: *"Premium SaaS dashboard hero scene: soft dusty-blue gradient sky transitioning to pale background, faint architectural columns and misty mountain silhouettes at the bottom in cool blue, abstract orange/copper light wisps and thin geometric line accents, cinematic, calm, institutional, high-end financial software aesthetic, no text, no UI mockups."*

Both are imported as ES6 modules:
```ts
import baniLogo from "@/assets/bani-logo.png";
import authHero from "@/assets/auth-hero.jpg";
```

## Layout

```text
┌─────────────────────────────┬──────────────────────────┐
│  LEFT (~58%)                │  RIGHT (~42%)            │
│  [auth-hero.jpg as bg]      │  [clean bg-background]   │
│  + gradient overlay         │                          │
│                             │       Sign In            │
│  [Bani logo] Bani           │                          │
│                             │   Email   [______]       │
│  Welcome to Bani            │   Password[___] 👁       │
│  ─                          │   ☐ Remember   Forgot?   │
│  Operational intelligence   │                          │
│  for revenue, procurement,  │   [   Sign In  →   ]     │
│  finance, and cash flow.    │                          │
│                             │   ──── or ────           │
│  • Revenue Intelligence     │   No account? Sign Up    │
│  • Procurement Excellence   │                          │
│  • Financial Clarity        │   🛡 Secure access —     │
│  • Cash Flow Control        │      Enterprise grade    │
│                             │                          │
│                             │      Powered by Bani     │
└─────────────────────────────┴──────────────────────────┘
```

Mobile (<lg): stacks. Hero image becomes a compact banner (~h-40) with Bani logo + headline overlay; form sits beneath full-width.

## Visual Design

All colors via existing CSS tokens (dusty blue + copper light theme; auto-adapts to navy + copper dark):

- **Left panel**: `auth-hero.jpg` as `bg-cover bg-center`, with a `bg-gradient-to-br from-background/95 via-background/70 to-primary/20` overlay so text remains crisp. Subtle copper radial glow top-right via a positioned `div`.
- **Bani brand row** (top-left): `<img>` of `bani-logo.png` in a 10×10 box + "Bani" wordmark in Space Grotesk bold 2xl.
- **Headline**: "Welcome to Bani" — Space Grotesk display, 4xl–5xl, with a 12-wide `bg-primary` underline accent.
- **Tagline**: copper one-liner then muted supporting paragraph.
- **Feature list**: 4 rows. Each row = circular `bg-primary/10 text-primary` icon chip (lucide `BarChart3`, `ShoppingCart`, `DollarSign`, `Activity`) + title + 1-line description.
- **Right panel**: `bg-background`. Form lives in a rounded-2xl bordered card with soft shadow and `p-8 lg:p-10`.
- **Form fields**: shadcn `Input` with leading icons (`Mail`, `Lock`); password gets `Eye`/`EyeOff` toggle.
- **Primary button**: full-width copper, trailing arrow, hover opacity, subtle shadow.
- **Secure access strip**: small bordered card under the form with `Shield` icon + copy.
- **Footer**: centered "Powered by **Bani**" with the small Bani logomark inline, muted.

No KHAMBU text or logo on this page.

## Functional Behavior (unchanged)

- Login / Signup toggle (signup adds display-name field).
- Email + password submit → `signInWithPassword` / `signUp`.
- Forgot password → `resetPasswordForEmail`.
- Show/hide password toggle (new, visual only).
- "Remember me" checkbox (visual only — Supabase already persists session).
- Redirect-if-authenticated effect unchanged.
- Loading state on submit unchanged.
- Error/success messages render in card.

## Theme Compatibility

All chrome uses tokens (`primary`, `background`, `muted`, `border`, `card`) so dark mode is automatic. Hero image works in both modes thanks to the gradient overlay (gradient pulls from `--background`).

## Files Touched

- **Generate** `src/assets/bani-logo.png` and `src/assets/auth-hero.jpg` (AI image gen).
- **Rewrite** `src/pages/Auth.tsx` (markup only; logic preserved).

No new npm dependencies, no DB changes, no routing changes.
