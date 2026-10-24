const TOOL_NAME = /`?\b(get|compare|render)_[a-z_]+\b`?|`?\b[a-z]+_(summary|status|overview|performance|trends|items|period)\b`?/gi;

/** Remove internal tool/function identifiers from user-facing text. */
export function stripToolNames(text: string): string {
  return text.replace(TOOL_NAME, "").replace(/\(\s*[,;]?\s*\)/g, "").replace(/[ \t]{2,}/g, " ");
}

/** Speak complete prose from the accurate answer; never rewrite numbers or read tables. */
export function groundedVoiceAnswer(answer: string): string {
  const prose = answer.split(/\n/).filter((line) => {
    const s = line.trim();
    return s && !s.startsWith("#") && !s.includes("|") && !s.startsWith("```") && !/^[*_]*sources?:/i.test(s);
  }).map((line) => line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").replace(/\*\*|`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")).join(" ");
  const sentences = stripToolNames(prose).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  let result = "";
  for (const sentence of sentences) {
    const next = `${result} ${sentence}`.trim();
    if (next.length > 2000) break;
    result = next;
  }
  return result || "The detailed answer is in the chat. Please review the figures there.";
}
