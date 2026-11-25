/** Quick replies must follow what was found: no dispute or price-change options when nothing is overcharged. */
export function cleanReplies(options: string[]): string[] {
  const zero = (o: string) => {
    if (/\$\s*X\b/i.test(o)) return true;
    const amount = o.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    return !!amount && Number(amount[1].replace(/,/g, "")) === 0;
  };
  const disputeWithoutAmount = options.some(zero);
  const kept = options.filter((o) => !zero(o) && !(disputeWithoutAmount && /credit note|accept new prices/i.test(o)));
  return (disputeWithoutAmount && !kept.length ? ["Book it", "Full review"] : kept).slice(0, 4);
}

/** A message that only hands the file over ('', 'here', 'delivery today', 'book this') rather than asking about it. */
export function isHandOver(text: string | undefined | null): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t) return true;
  if (t.includes("?")) return false;
  if (/^(is|are|does|do|did|can|could|should|would|what|why|how|which|who|when|where)\b/.test(t)) return false;
  return !/\b(compare|explain|tell me|summar\w*|fair|cheaper|price history|analy[sz]e|review|check (the )?prices?)\b/.test(t);
}
