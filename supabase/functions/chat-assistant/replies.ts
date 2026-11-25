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

const FILES_ONLY_LEGACY = "please read the attached file(s), summarise what they show, and ask me what i would like to do with them.";

/** A message that only hands the file over ('', 'here', 'delivery today', 'book this') rather than asking about it. */
export function isHandOver(text: string | undefined | null): boolean {
  // The app adds "[Attached files: …]" and page context in brackets; only the person's own words count.
  let t = (text || "").replace(/\n\[[^\n]*\]/g, "").trim().toLowerCase();
  // What the app sends when the person attached files without typing anything (old and new wording).
  if (t === FILES_ONLY_LEGACY || t === "(no message)") t = "";
  if (!t) return true;
  if (t.includes("?")) return false;
  if (/^(is|are|does|do|did|can|could|should|would|what|why|how|which|who|when|where)\b/.test(t)) return false;
  return !/\b(compare|explain|tell me|summar\w*|fair|cheaper|price history|analy[sz]e|review|check (the )?prices?)\b/.test(t);
}
