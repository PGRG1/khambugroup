/**
 * One chart size for the whole portal (see AGENTS.md "Tables and charts").
 * Every chart is 170px tall on phone and 240px on computer, so no page has a huge chart and another a small one.
 * Sparklines and tiny inline charts keep their own small height.
 */
export const CHART_HEIGHT = { phone: 170, computer: 240 } as const;

export function chartHeight(mobile?: boolean): number {
  const phone = mobile ?? (typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 639px)").matches);
  return phone ? CHART_HEIGHT.phone : CHART_HEIGHT.computer;
}
