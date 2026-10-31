export type Person = { id: string; first_name: string; last_name: string };
export function exactPerson(name: string, people: Person[]) {
  const normal = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const key = normal(name);
  if (!key) throw new Error("Who is this for? Please give their full name.");
  const full = people.filter(p => normal(`${p.first_name} ${p.last_name}`) === key);
  const matches = full.length ? full : people.filter(p => normal(`${p.first_name} ${p.last_name}`).split(" ").includes(key));
  if (matches.length !== 1) throw new Error(matches.length ? "That name matches several people. Please give the full name." : "No person matches that name. Please give their full name.");
  return matches[0];
}
export function checkedDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Which exact date do you mean?");
  return value;
}
export function monday(value: string) {
  checkedDate(value);
  if (new Date(`${value}T00:00:00Z`).getUTCDay() !== 1) throw new Error("Please specify the Monday that starts the rota week.");
  return value;
}
export function addDays(value: string, days: number) {
  const d = new Date(`${checkedDate(value)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function instructedPay(text: string, value: number) {
  if (/\b(suggest|recommend|deserve|how much|should.*(?:pay|raise|bonus))\b/i.test(text)) throw new Error("I never recommend pay. What exact instruction do you want carried out?");
  const amounts = [...text.matchAll(/(?:HK\s*\$\s*|HKD\s*|\$\s*)(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:HKD|dollars?)\b/gi)].map(m => Number((m[1] ?? m[2]).replace(/,/g, "")));
  if (!Number.isFinite(value) || value < 0 || !amounts.includes(value)) throw new Error("Please give the exact pay amount in HK dollars; I will not invent one.");
}
export const PEOPLE_OPERATIONS = ["rota_edit", "rota_copy", "rota_send", "leave", "team_change", "team_approve", "payroll_instruction", "payroll_prepare"] as const;
export function establishedScope(text: string, value: string, label: string) {
  const normalized = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!value || !(` ${normalized(text)} `).includes(` ${normalized(value)} `)) throw new Error(`Which ${label} do you mean? Please specify it explicitly.`);
}
export function establishedPeriod(text: string, value: string, label: string) {
  if (text.includes(value)) return;
  const d = new Date(`${value.length === 7 ? `${value}-01` : value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) throw new Error(`Which ${label} do you mean?`);
  const month = d.toLocaleString("en", { month: "long", timeZone: "UTC" });
  const pattern = value.length === 7 ? new RegExp(`\\b(?:${month}|${month.slice(0, 3)})\\s+${d.getUTCFullYear()}\\b`, "i") : new RegExp(`\\b${d.getUTCDate()}\\s+(?:${month}|${month.slice(0, 3)})\\s+${d.getUTCFullYear()}\\b`, "i");
  if (!pattern.test(text)) throw new Error(`Which exact ${label} and year do you mean?`);
}