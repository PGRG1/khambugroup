# Tighten the layout so it doesn't feel over-stretched

After removing the width caps, content now spans the full 3490px screen which makes charts feel sparse, line lengths too long, and tables too airy. The fix is to give the **main content area** a comfortable maximum that scales nicely on ultra-wide monitors while still using a normal laptop fully.

## Approach

Cap the inner content area in `AppLayout` (not the sidebar). The sidebar stays flush left; the main panel grows up to a comfortable max and centers itself within remaining space.

### `src/components/AppLayout.tsx`
Change the inner content wrapper:
```tsx
// before
<div className="flex-1 p-3 sm:p-6 lg:p-8">

// after
<div className="flex-1 w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:p-8 2xl:px-12">
```

Why 1800px: comfortably wider than the old 1400px cap (so dashboards breathe), but stops short of feeling sparse on 3K/4K. Extra horizontal padding at `2xl` keeps a little air on either side.

### Per-page wrappers — leave as-is
Already updated last turn:
- Dashboard pages use `w-full mx-auto` → fill the new 1800px container
- Finance pages use `max-w-[1920px] mx-auto` → effectively capped by the parent now, which is fine

No further per-page changes needed.

## Result

- Laptops (1366–1800px): identical — uses the full screen.
- Standard monitors (1920–2560px): main panel sits at 1800px wide with even side margins. Looks intentional and balanced.
- Ultra-wide (3000px+): sidebar on the left, content centered in a comfortable column instead of stretching across the whole display.
- Mobile/tablet: unchanged.
