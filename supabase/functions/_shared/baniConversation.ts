type Turn = { role: "user" | "assistant"; content: string };

/** Whole recent turns, with bounded cost and no invented summaries. */
export function recentBaniTurns(turns: Turn[]): Turn[] {
  const kept: Turn[] = []; let chars = 0;
  for (const turn of turns.slice(-24).reverse()) {
    const content = turn.content.slice(0, 8000);
    if (chars + content.length > 48000) break;
    kept.unshift({ role: turn.role, content }); chars += content.length;
  }
  return kept;
}

export function honestBaniAnswer(text: string, facts: { cardEmitted: boolean; writeCompleted: boolean; screenOpened?: boolean }): string {
  // Identity is implicit even when a model disregards the prompt.
  let answer = text.replace(/^\s*(?:(?:hi|hello|hey)[!,.—\s]*)?(?:i(?:'m| am)|this is) bani[^.!?\n]*[.!?]?\s*/i, "");
  if (!facts.cardEmitted && /\b(?:prepared|created|made|sent|shown)\b[^.\n]*\b(?:card|confirm\/cancel)\b/i.test(answer))
    answer = "No action card was created. Tell me the specific action you want, and I’ll check whether it’s supported.";
  if (!facts.writeCompleted && /\b(?:i(?:'ve| have)?|successfully)\s+(?:saved|posted|recorded|updated|approved|paid)\b/i.test(answer))
    answer = "No financial change was confirmed. Receipt uploads must go through Scan Receipt; unresolved receipts stay flagged without posting sales.";
  if (facts.screenOpened === false && /(?:\bi(?:['’]ve| have| am|['’]m)?\s+(?:opened|opening)\b|\btaking you\b)[^.\n]*\b(?:scanner|scan invoice|scan receipt|review|procurement)\b/i.test(answer))
    answer = "Nothing was opened yet. Say “book it as disputed” or “add it to procurement” and I’ll get it ready for you to confirm.";
  return answer.trim() || "What would you like to look at?";
}