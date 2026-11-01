// Evidence is authoritative; upload context never silently rewrites a printed year.
export type DateEvidence = { date: string; raw: string; weekday?: string | null; uploadDay: string; explicitHistorical?: boolean; corroboratedDate?: string | null };
const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export function checkDocumentDate(e: DateEvidence) {
  let date = e.date;
  const reasons: string[] = [];
  let correction: string | null = null;
  if (!validDay(date) || !validDay(e.uploadDay)) return { date, correction, reasons: ["Which trading date is printed on this document?"] };
  if (e.corroboratedDate && validDay(e.corroboratedDate) && !e.explicitHistorical && date !== e.corroboratedDate) {
    const candidate = e.corroboratedDate;
    // Independent printed evidence is supplied by the verifier, not by a human answer or history.
    if (candidate <= e.uploadDay && Date.parse(e.uploadDay) - Date.parse(candidate) <= 60 * 86400_000 && (!e.weekday || weekdays[new Date(candidate).getUTCDay()] === e.weekday.toLowerCase().slice(0, 3))) {
      correction = date.slice(5) === candidate.slice(5) ? `Year read as ${date.slice(0, 4)}, corrected to ${candidate.slice(0, 4)}` : `Date read as ${date}, corrected to ${candidate}`;
      date = candidate;
    }
  }
  if (date > e.uploadDay) reasons.push(`Date reads ${date}, which is in the future — what date is printed?`);
  if (!e.explicitHistorical && Date.parse(e.uploadDay) - Date.parse(date) > 60 * 86400_000) reasons.push(`Date reads ${e.raw || date} — is this a historical document or a misread date?`);
  if (e.weekday && weekdays[new Date(date).getUTCDay()] !== e.weekday.toLowerCase().slice(0, 3)) reasons.push(`The printed weekday ${e.weekday} does not match ${date} — which date is correct?`);
  return { date, correction, reasons };
}
export function sameDocument(a: { hash?: string; number?: string; date: string; party: string; total: number; fingerprint?: string }, b: { hash?: string; number?: string; date: string; party: string; total: number; fingerprint?: string }) {
  if (a.hash && a.hash === b.hash) return true;
  if (a.party !== b.party) return false;
  if (a.number?.trim() && a.number.trim() === b.number?.trim()) return true;
  return a.date === b.date && a.total === b.total && !!a.fingerprint && a.fingerprint === b.fingerprint;
}
export function nextDocumentQuestion(reasons: string[]) { return reasons.find(Boolean) ?? null; }