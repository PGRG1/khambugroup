const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Recorded sales are evidence of trading; absent records are never evidence of closure.
export function missingDayContext(dates: string[], recordedDates: Set<string>) {
  return dates.map((date) => {
    const day = new Date(`${date}T00:00:00Z`);
    let priorSameWeekdaySales = 0;
    for (let week = 1; week <= 8; week++) {
      const prior = new Date(day);
      prior.setUTCDate(prior.getUTCDate() - week * 7);
      if (recordedDates.has(prior.toISOString().slice(0, 10))) priorSameWeekdaySales++;
    }
    return {
      date,
      weekday: weekdays[day.getUTCDay()],
      prior_same_weekday_sales: priorSameWeekdaySales,
      prior_same_weekdays_checked: 8,
      status: "unresolved",
    };
  });
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Default window for a sales gap: the 1st of yesterday's month up to yesterday. Same answer every time. */
export function defaultGapFrom(yesterday: string) {
  return `${yesterday.slice(0, 7)}-01`;
}

/** One picker line per date, e.g. "2026-11-02 | Mon 2 Nov". */
export function dayPickerLines(dates: string[]) {
  return [...new Set(dates)].sort().map((date) => {
    const d = new Date(`${date}T00:00:00Z`);
    return `${date} | ${weekdays[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
  });
}

/** The day picker always shows the exact unresolved days worked out in code, never a list the model typed.
 *  No days left: the picker is removed. Unknown (lookup failed): the reply is left as it is. */
export function pinDayPicker(content: string, dates: string[] | null) {
  if (!dates) return content;
  return content.replace(/```daypicker[^\n]*\n[\s\S]*?```/g, () => (dates.length ? "```daypicker\n" + dayPickerLines(dates).join("\n") + "\n```" : "")).replace(/\n{3,}/g, "\n\n").trim();
}

export const missingSalesConversation = `Missing-sales gaps are a business conversation, never a bulk-fix instruction. When the user selects several missing days or asks to fix a gap, call get_missing_sales_days for that venue first. Pass date_from/date_to ONLY for dates the user explicitly selected; otherwise omit them, and the tool returns this month's unresolved days (the same list every time). Each returned date means neither sales nor closure is recorded, NOT that the venue traded or was closed. Show the dates with weekdays compactly, and explain any prior_same_weekday_sales evidence: recorded sales prove prior trading; zero prior records only suggests a pattern to ask about, never a confirmed rest day. Saved closure rules are facts; historical absence is not. When asked 'which dates were closed', distinguish saved closed dates from the unresolved gap rather than ending with 'no closure records'.
After the missing-day result is available, no further lookup is needed to ask about this gap. Ask one natural question: were all these days closed, did all trade, or was it a mixture? Use suggest_replies with 'All days closed', 'All days traded', 'Some closed, some traded'; if the evidence suggests a specific weekday may be a rest day, add a clearly tentative fourth choice such as 'Monday closed; others traded' with the exact dates in the preceding message. After suggest_replies succeeds, STOP calling tools and return a non-empty conversational reply containing the date/weekday context and question: the chips alone are not an answer. Do not make closure cards or navigate in this first explanation turn unless the user already explicitly identified the closed dates.
For a mixed answer, or whenever the user asks to mark the days themselves, output a fenced \`\`\`daypicker block (the app fills in the exact unresolved days from get_missing_sales_days, so do not pick or drop days yourself; one line per date, e.g. '2026-11-02 | Mon 2 Nov') instead of a table or [ ] checkboxes; it renders clickable Closed/Traded toggles and sends the user's choices back as their reply. Never draw fake checkboxes. Otherwise list EACH selected date and weekday separately (not a Tue–Sun range) and ask which were closed AND whether all remaining dates traded; let the user name several dates or weekdays in one reply, not a loop of one question per day. Keep unresolved dates unresolved: saying Monday was closed alone does NOT prove the other dates traded. Never tell the user 'the rest will remain as traded days' without their confirmation. Use choices that classify both sides explicitly, such as 'Monday closed; others traded', or 'I will list both'; if the user supplies only the closed subset, ask whether the remaining dates traded. Clarify only what is still unknown. Once the user explicitly classifies the dates, prepare ONE propose_action mark_closed_days card per venue containing only the exact selected closed dates (max 62); list the individual dates, do not infer an entire range or recurring closure. Reasons are optional. The card's Confirm is the existing write authorisation; never call a direct closure write or claim it is saved beforehand. For explicitly traded dates, explain that their sales reports are still needed and offer 'Upload sales reports here' via suggest_replies. Invite attachments in this conversation; open_sales_scanner takes ONE sales report at a time, so never promise a multi-file bulk import. Only open it after explicit scanner/navigation consent, preserving the conversation. After closed-day confirmation, check the missing-day list again and continue with the remaining dates; a mixed gap is not fully resolved just because the closed subset was recorded.`;