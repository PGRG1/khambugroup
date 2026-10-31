import { z } from "npm:zod@4";
import { addDays, checkedDate, exactPerson, establishedScope, establishedPeriod, instructedPay, monday, PEOPLE_OPERATIONS } from "./peopleRules.ts";
type Client = any;
const uuid = z.string().uuid();
const Args = z.object({
  operation: z.enum(PEOPLE_OPERATIONS), instruction: z.string().min(1).max(3000),
  venue: z.string().optional(), week_start: z.string().optional(), person: z.string().optional(),
  date_from: z.string().optional(), date_to: z.string().optional(), leave_type: z.string().optional(),
  request_id: uuid.optional(), change_id: uuid.optional(), month: z.string().optional(),
  effective_date: z.string().optional(), change_type: z.enum(["joined", "promotion", "pay_change", "type_change", "venue_move", "left", "details"]).optional(),
  values: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  shifts: z.array(z.object({ id: uuid.optional(), person: z.string(), date: z.string(), start_time: z.string().optional(), end_time: z.string().optional(), break_minutes: z.number().int().min(0).max(1440).optional(), role: z.string().optional(), rest: z.boolean().optional(), remove: z.boolean().optional(), replacement: z.string().optional() })).max(500).optional(),
});
export const peopleTool = { type: "function", function: {
  name: "draft_people_action",
  description: "Draft a People write for Confirm/Change/Cancel. NEVER saves before Confirm. Reuse previous explicit user context for names/dates but ask if unclear. No pay advice. Payroll approval is NEVER supported. Use exact user instruction, not your paraphrase. Rota copy copies saved last week into empty days; from scratch requires explicit person/day/times; cover requires a named replacement. leave shows balance first. team_change handles joiner, dated type/promotion/pay/venue/leaver. team_approve requires owner and change_id. payroll_instruction invokes the exact page instruction parser; month must be explicitly established. No guessed person/venue/week/month/amount.",
  parameters: { type: "object", properties: {
    operation: { type: "string", enum: [...PEOPLE_OPERATIONS] }, instruction: { type: "string" }, venue: { type: "string" }, week_start: { type: "string", description: "Monday YYYY-MM-DD" }, person: { type: "string" },
    date_from: { type: "string" }, date_to: { type: "string" }, leave_type: { type: "string", description: "Exact Annual leave, Sick leave or Unpaid type; never invent paid balance" }, request_id: { type: "string" }, change_id: { type: "string" }, month: { type: "string", description: "YYYY-MM, explicitly established by user" }, effective_date: { type: "string" }, change_type: { type: "string", enum: ["joined", "promotion", "pay_change", "type_change", "venue_move", "left", "details"] }, values: { type: "object", description: "Only explicitly stated Team fields, canonical English names; no invented pay" },
    shifts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, person: { type: "string" }, date: { type: "string" }, start_time: { type: "string" }, end_time: { type: "string" }, break_minutes: { type: "integer" }, role: { type: "string" }, rest: { type: "boolean" }, remove: { type: "boolean" }, replacement: { type: "string" } }, required: ["person", "date"] } },
  }, required: ["operation", "instruction"] },
} };
export const peopleContextTool = { type: "function", function: { name: "get_people_action_context", description: "Permission-scoped People names/venues, leave balances, pending owner changes and existing shifts for a named week; use before drafting and never choose between ambiguous people.", parameters: { type: "object", properties: { venue: { type: "string" }, week_start: { type: "string" } } } } };
async function all(client: Client, table: string, tenant: string, filter?: (q: any) => any) {
  const out: any[] = [];
  for (let from = 0;; from += 1000) {
    let q = client.from(table).select("*").eq("tenant_id", tenant).range(from, from + 999); if (filter) q = filter(q);
    const { data, error } = await q; if (error) throw new Error(error.message); out.push(...data); if (data.length < 1000) return out;
  }
}
async function rpc(client: Client, name: string, args: any) { const { data, error } = await client.rpc(name, args); if (error) throw new Error(error.message); return data; }
const hk = (n: number) => `HK$ ${Math.round(n).toLocaleString("en-HK")}`;
export async function peopleContext(client: Client, tenant: string, user: string, args: any) {
  if (!await rpc(client, "people_access", { t: tenant, u: user })) throw new Error("People access required");
  const raw = await all(client, "hr_employees", tenant);
  const scoped = await Promise.all(raw.map(async p => await rpc(client, "people_person_access", { t: tenant, e: p.id, u: user }) ? p : null));
  const people = scoped.filter(Boolean);
  const venues = (await all(client, "venues", tenant)).filter(v => v.is_active);
  const allowed = (await Promise.all(venues.map(async v => await rpc(client, "rota_manager", { t: tenant, v: v.id, u: user }) ? v : null))).filter(Boolean);
  let shifts: any[] = [];
  if (args.week_start) {
    const w = monday(args.week_start); const venue = allowed.find(v => v.name.toLowerCase() === String(args.venue ?? "").toLowerCase());
    if (!venue) throw new Error("Which venue is this rota for?");
    shifts = (await all(client, "hr_shifts", tenant, q => q.gte("shift_date", w).lte("shift_date", addDays(w, 6)))).filter(s => s.venue_id === venue.id || !s.venue_id && people.some(p => p.id === s.employee_id && p.venue_id === venue.id));
  }
  const ids = new Set(people.map(p => p.id));
  return { people: people.map(p => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, venue_id: p.venue_id, job_title: p.job_title })), venues: allowed.map(v => ({ id: v.id, name: v.name })), shifts, balances: (await all(client, "hr_leave_balances", tenant)).filter(b => ids.has(b.employee_id)), leave_types: await all(client, "hr_leave_types", tenant), pending_changes: (await all(client, "hr_people_changes", tenant, q => q.eq("status", "pending"))).filter(c => !c.employee_id || ids.has(c.employee_id)) };
}
export async function draftPeopleAction(raw: unknown, client: Client, admin: Client, tenant: string, user: string, userText: string, scopeText = userText) {
  const a = Args.parse(raw);
  // Instruction is the real user's text, never model-authored wording/numbers.
  const instruction = userText;
  const ctx = await peopleContext(client, tenant, user, {});
  const person = () => { establishedScope(scopeText, a.person ?? "", "person"); return exactPerson(a.person ?? "", ctx.people); };
  const venue = () => { establishedScope(scopeText, a.venue ?? "", "venue"); const matches = ctx.venues.filter(v => v.name.toLowerCase() === String(a.venue ?? "").toLowerCase()); if (matches.length !== 1) throw new Error("Which venue do you mean?"); return matches[0]; };
  const p: any = { operation: a.operation, instruction };
  let title = "People", detail = "", link = "/hr/employees";
  if (a.operation.startsWith("rota_")) {
    const v = venue(), w = monday(a.week_start ?? ""); const end = addDays(w, 6);
    establishedPeriod(scopeText, w, "week start");
    p.venue_id = v.id; p.week_start = w; link = `/hr/schedule?week=${w}&venue=${v.id}`;
    const own = (await all(client, "hr_shifts", tenant, q => q.gte("shift_date", w).lte("shift_date", end))).filter(s => s.venue_id === v.id || !s.venue_id && ctx.people.some(e => e.id === s.employee_id && e.venue_id === v.id));
    p.before = own; p.week_before = await all(client, "hr_rota_weeks", tenant, q => q.eq("venue_id", v.id).eq("week_start", w));
    if (a.operation === "rota_send") { detail = `Send saved rota · ${own.length} entries`; }
    else if (a.operation === "rota_copy") {
      if (!/\bcopy\b/i.test(instruction)) throw new Error("Would you like to copy last week's saved rota?");
      const prior = (await all(client, "hr_shifts", tenant, q => q.gte("shift_date", addDays(w, -7)).lt("shift_date", w))).filter(s => s.venue_id === v.id || !s.venue_id && ctx.people.some(e => e.id === s.employee_id && e.venue_id === v.id));
      p.changes = prior.map(s => ({ employee_id: s.employee_id, shift_date: addDays(s.shift_date, 7), start_time: s.start_time, end_time: s.end_time, break_minutes: s.break_minutes, role: s.role, shift_type: s.shift_type })).filter(s => !own.some(o => o.employee_id === s.employee_id && o.shift_date === s.shift_date));
      if (!p.changes.length) throw new Error("No saved shifts to copy into empty days for that week.");
      p.operation = "rota_edit"; detail = "Copy last week into empty days; existing entries stay unchanged.";
    } else {
      if (!a.shifts?.length) throw new Error("Please specify the people, days and shift times, or say copy last week.");
      p.changes = a.shifts.map(s => {
        establishedScope(scopeText, s.person, "person");
        if (s.replacement) establishedScope(scopeText, s.replacement, "cover person");
        const e = exactPerson(s.person, ctx.people); const date = checkedDate(s.date);
        const record = ctx.people.find(p => p.id === e.id);
        if (record?.venue_id !== v.id) throw new Error(`${s.person} is not assigned to ${v.name}; specify their assigned venue or record a dated venue change first.`);
        if (date < w || date > end) throw new Error("A shift falls outside that week. Which week should change?");
        const candidates = own.filter(o => o.employee_id === e.id && o.shift_date === date && (!s.id || o.id === s.id));
        if (candidates.length > 1) throw new Error(`Which ${s.person} shift on ${date} do you mean?`);
        const old = candidates[0];
        if (s.id && !old || (s.remove || s.replacement) && !old) throw new Error("That saved shift was not found; check the rota.");
        if (s.replacement) return { swap_id: old.id, replacement: exactPerson(s.replacement, ctx.people).id };
        if (s.remove) return { id: old.id, employee_id: e.id, shift_date: date, remove: true };
        const start = s.start_time ?? old?.start_time, endTime = s.end_time ?? old?.end_time;
        if (!s.rest && (!start || !endTime)) throw new Error("What are the shift's start and finish times?");
        return { ...(old ? { id: old.id } : {}), employee_id: e.id, shift_date: date, shift_type: s.rest ? "RD" : "regular", start_time: s.rest ? "00:00" : start, end_time: s.rest ? "00:00" : endTime, break_minutes: s.break_minutes ?? old?.break_minutes ?? 0, role: s.role ?? old?.role ?? null };
      });
      detail = p.changes.map((c: any) => { const s = own.find(o => o.id === c.swap_id); const e = ctx.people.find(e => e.id === (c.employee_id ?? s?.employee_id)); const r = ctx.people.find(e => e.id === c.replacement); return `${e?.first_name} ${e?.last_name} · ${c.shift_date ?? s?.shift_date} · ${c.swap_id ? `cover ${r?.first_name} ${r?.last_name}` : c.remove ? "remove shift" : c.shift_type === "RD" ? "Rest day" : `${c.start_time}–${c.end_time} · break ${c.break_minutes} min${c.role ? ` · ${c.role}` : ""}`}`; }).join("\n");
    }
    p.display_changes = p.changes ?? []; title = `Rota · ${v.name} · week of ${w}`;
    if (a.operation === "rota_copy") detail += "\n" + p.changes.map((c: any) => { const e = ctx.people.find(e => e.id === c.employee_id); return `${e?.first_name} ${e?.last_name} · ${c.shift_date} · ${c.shift_type === "RD" ? "Rest day" : `${c.start_time}–${c.end_time} · break ${c.break_minutes} min`}`; }).join("\n");
  } else if (a.operation === "leave") {
    const e = person(); p.employee_id = e.id; p.date_from = checkedDate(a.date_from ?? ""); p.date_to = checkedDate(a.date_to ?? a.date_from ?? "");
    establishedPeriod(scopeText, p.date_from, "leave date"); establishedPeriod(scopeText, p.date_to, "leave end date");
    if (p.date_to < p.date_from || p.date_to.slice(0, 4) !== p.date_from.slice(0, 4)) throw new Error("Choose leave dates in one calendar year.");
    const types = ctx.leave_types.filter(t => t.is_active && t.name.toLowerCase() === String(a.leave_type ?? "").toLowerCase());
    if (types.length !== 1 && a.leave_type !== "Unpaid") throw new Error(`Which leave type? ${ctx.leave_types.filter(t => t.is_active).map(t => t.name).join(", ")}`);
    const type = types[0]; p.leave_type = type?.name ?? "Unpaid"; p.request_id = a.request_id ?? null;
    const bal = ctx.balances.filter(b => b.employee_id === e.id && b.leave_type_id === type?.id && b.year === Number(p.date_from.slice(0, 4)));
    if (bal.length > 1) throw new Error("Several leave balances exist; check this person's balance on People first.");
    const remaining = bal[0] ? Number(bal[0].carried_forward ?? 0) + Number(bal[0].total_days) + Number(bal[0].adjustments ?? 0) - Number(bal[0].used_days) : null;
    if (type?.is_paid && remaining === null) throw new Error("No paid leave balance recorded. Check this person's balance first.");
    p.balance_before = bal; p.shifts_before = await all(client, "hr_shifts", tenant, q => q.eq("employee_id", e.id).gte("shift_date", p.date_from).lte("shift_date", p.date_to));
    p.requests_before = await all(client, "hr_leave_requests", tenant, q => q.eq("employee_id", e.id));
    if (p.request_id) { const r = p.requests_before.find((r: any) => r.id === p.request_id); if (!r || r.status !== "pending" || r.start_date !== p.date_from || r.end_date !== p.date_to || r.leave_type_id !== type?.id) throw new Error("That leave request no longer matches; check it again."); }
    p.venue_id = (await rpc(client, "people_change_scope", { t: tenant, e: e.id, p: {}, u: user })) ? (await all(client, "hr_employees", tenant, q => q.eq("id", e.id)))[0]?.venue_id : null;
    title = `Leave · ${e.first_name} ${e.last_name} · ${p.date_from}–${p.date_to}`;
    detail = `Balance first: ${remaining === null ? "Unpaid · no paid balance used" : `${remaining} days available`}\n${p.request_id ? "Approve" : "Record"} ${p.leave_type} · ${Math.round((Date.parse(p.date_to) - Date.parse(p.date_from)) / 86400000) + 1} days`; link = "/hr/schedule";
  } else if (a.operation === "team_change") {
    const kind = a.change_type; if (!kind) throw new Error("What Team change should be recorded?");
    const values: any = { ...a.values }; const date = checkedDate(a.effective_date ?? "");
    establishedPeriod(scopeText, date, "effective date");
    const e = kind === "joined" ? null : person();
    if (kind === "joined" && (!values.first_name || !values.last_name)) throw new Error("What are the joiner's first and last names?");
    if (kind === "joined" && ctx.people.some(e => `${e.first_name} ${e.last_name}`.toLowerCase() === `${values.first_name} ${values.last_name}`.toLowerCase())) throw new Error("That person already exists. Is this a change to their record?");
    if (values.pay_amount !== undefined) instructedPay(instruction, Number(values.pay_amount));
    if (a.venue || kind === "joined" || kind === "venue_move") { const v = venue(); values.venue_id = v.id; values.venue = v.name; }
    if (kind === "joined") values.hire_date = date;
    if (kind === "left") { values.end_date = date; values.status = "resigned"; }
    if (!Object.keys(values).length) throw new Error("What exactly should change?");
    if (!await rpc(client, "people_change_scope", { t: tenant, e: e?.id ?? null, p: values, u: user })) throw new Error("Person and venue access required");
    p.employee_id = e?.id ?? null; p.values = values; p.effective_date = date; p.change_type = kind;
    p.person_before = e ? (await all(client, "hr_employees", tenant, q => q.eq("id", e.id)))[0] : null;
    title = `Team · ${e ? `${e.first_name} ${e.last_name}` : `${values.first_name} ${values.last_name}`} · ${date}`;
    const settings = await rpc(client, "people_effective_settings", { t: tenant, v: values.venue_id ?? p.person_before?.venue_id ?? null });
    const owner = await rpc(client, "people_owner", { t: tenant, u: user });
    detail = `${kind.replace(/_/g, " ")}\n${Object.entries(values).map(([k, v]) => `${k.replace(/_/g, " ")}: ${k === "pay_amount" ? hk(Number(v)) : v}`).join("\n")}\n${settings.approvals === "owner_run" && owner ? "Applied on Confirm" : "Submitted for owner approval on Confirm"}`;
  } else if (a.operation === "team_approve") {
    if (!a.change_id || !await rpc(client, "people_owner", { t: tenant, u: user })) throw new Error("Owner approval required");
    const c = ctx.pending_changes.find(c => c.id === a.change_id); if (!c) throw new Error("Which pending Team change should be approved?");
    p.change_id = c.id; p.change_before = c; title = `Team approval · effective ${c.effective_date}`; detail = JSON.stringify(c.values);
  } else {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(a.month ?? "")) throw new Error("Which payroll month and year do you mean?");
    const [y, m] = String(a.month).split("-").map(Number); p.year = y; p.month = m; link = `/hr/payroll?year=${y}&month=${m}`;
    establishedPeriod(scopeText, String(a.month), "payroll month");
    if (!await rpc(client, "payroll_manager", { t: tenant, u: user })) throw new Error("Payroll manager access required");
    const preview = await rpc(client, "payroll_preview", { t: tenant, y, m });
    const period = await all(client, "hr_payroll_months", tenant, q => q.eq("year", y).eq("month", m)); p.period_before = period;
    if (a.operation === "payroll_prepare") { p.preview_before = preview; title = `Prepare payroll · ${a.month}`; detail = `${preview.length} people · calculate from dated contracts, rota/typed hours and leave. Missing inputs remain flagged; no approval.`; }
    else {
      const { data: draft, error } = await client.functions.invoke("people-payroll-draft", { body: { tenant_id: tenant, year: y, month: m, text: instruction } });
      if (error) throw new Error(error.message); if (!draft?.changes?.length) throw new Error(draft?.answer || "What exact pay instruction do you want carried out?");
      const change = draft.changes[0]; const e = ctx.people.find(e => e.id === change.employee_id); if (!e) throw new Error("Person access required");
      p.changes = draft.changes; p.repeating = draft.repeat === true; p.revision = draft.revision;
      title = `Confirm pay change · ${e.first_name} ${e.last_name} · ${a.month}`;
      detail = `Net pay ${hk(change.net_before)} → ${hk(change.net_after)}\n${change.field.replace(/_/g, " ")}: ${change.delta >= 0 ? "+" : "−"}${hk(Math.abs(change.delta))}\nReason: ${change.reason}\n${change.rota_fact ?? ""}\n${p.repeating ? "Every month" : "This month only"}`;
    }
  }
  p.link = link; p.summary = detail;
  const { data, error } = await admin.from("bani_pending_actions").insert({ tenant_id: tenant, user_id: user, kind: "people", title: title.slice(0, 200), detail: detail.slice(0, 500), payload: p }).select("id").single();
  if (error) throw new Error(error.message);
  return { ok: true, action_id: data.id, title, detail, kind: "people", note: "Draft card emitted. Nothing saved. Confirm uses existing People approvals and permissions." };
}