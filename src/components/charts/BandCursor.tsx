// Hover highlight for bar charts: a soft band behind the whole column, as on Stripe or Shopify.
// Recharts draws a thin line instead when bars sit in a ComposedChart, and ignores `fill`, so the
// band is drawn here from the hovered x and the plot size Recharts hands to a custom cursor.
interface Props { points?: { x: number; y: number }[]; top?: number; left?: number; width?: number; height?: number; count: number }

export function BandCursor({ points, top = 0, left = 0, width = 0, height = 0, count }: Props) {
  const x = points?.[0]?.x;
  if (x == null || !count || !width) return null;
  const band = width / count;
  const start = Math.max(left, x - band / 2);
  return <rect x={start} y={top} width={Math.min(band, left + width - start)} height={height} fill="hsl(var(--foreground))" fillOpacity={0.06} pointerEvents="none" />;
}
