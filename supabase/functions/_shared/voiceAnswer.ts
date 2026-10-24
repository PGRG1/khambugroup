/** Speak complete prose from the accurate answer; never rewrite numbers or read tables. */
export function groundedVoiceAnswer(answer: string): string {
  const prose = answer.split(/\n/).filter((line) => {
    const s = line.trim();
    return s && !s.startsWith("#") && !s.includes("|") && !s.startsWith("```");
  }).map((line) => line.replace(/^\s*[-*]\s+/, "").replace(/\*\*|`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")).join(" ");
  const sentences = prose.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [];
  let result = "";
  for (const sentence of sentences.slice(0, 3)) {
    const next = `${result} ${sentence.trim()}`.trim();
    if (next.length > 600) break;
    result = next;
  }
  return result || "The detailed answer is in the chat. Please review the figures there.";
}