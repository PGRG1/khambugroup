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
