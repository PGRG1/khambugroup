import { Fragment } from "react";
import { usePeopleRoles } from "@/hooks/usePeopleRoles";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";
import { shiftHours, leaveOnDay, leaveCode, type RotaRow } from "@/utils/peopleRota";
import { roleGroup } from "@/utils/peoplePresentation";
import { formatDecimal, formatDate } from "@/utils/format";
import { shiftKind, venueDayHours, type ShiftKind } from "@/utils/rotaShiftKind";

/** Colours by the venue's own hours: green opens, blue closes, amber long, grey middle; no hours = no colour. */
const TONE: Record<ShiftKind, string> = {
  open: "background:#E3F1EA;color:#1F6B5E",
  close: "background:#E6EEF9;color:#2B5A9B",
  both: "background:linear-gradient(90deg,#E3F1EA 50%,#E6EEF9 50%);color:#1F3F3B",
  long: "background:#FBF1E4;color:#8A420B",
  mid: "background:#F1F3F1;color:#3F4A45",
  none: "background:#FFFFFF;color:#1F3F3B;box-shadow:inset 0 0 0 1px rgba(31,63,59,.18)",
};
const css = (s: string) => Object.fromEntries(s.split(";").filter(Boolean).map(p => { const [k, v] = p.split(":"); return [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]; }));
const LEAVE = new Set(["al", "sl", "sh", "npl"]);
const OFF = new Set(["off", "rd"]);

/** Phone rota: the whole week on one screen, each shift showing its real start and finish. */
export function RotaWeekPhone({ venues, people, shifts, allShifts = shifts, leave, holidays, days, disabled, onCell, shiftVenue }: {
  venues: RotaRow[]; people: RotaRow[]; shifts: RotaRow[]; allShifts?: RotaRow[]; leave: RotaRow[]; holidays: RotaRow[];
  days: string[]; disabled: boolean; onCell: (person: RotaRow, day: string, shift?: RotaRow) => void; shiftVenue: (s: RotaRow) => RotaRow | undefined;
}) {
  const rolesMap = usePeopleRoles();
  const periods = useVenueServicePeriods(venues.map(v => v.id)).rows ?? [];
  const grouped = [...new Set(people.map(p => roleGroup(p.job_title, rolesMap)))].sort();
  const cell = "inline-flex w-[34px] min-h-[34px] rounded-[6px] items-center justify-center";
  const tag = (s: RotaRow, p: RotaRow, d: string) => {
    const type = String(s.shift_type ?? "regular").toLowerCase(), hours = shiftHours(s);
    if (LEAVE.has(type)) return <button key={s.id} type="button" disabled={disabled} onClick={() => onCell(p, d, s)} className={`${cell} text-[9px] font-semibold`} style={css("background:repeating-linear-gradient(135deg,#EEF4FB 0 4px,#E2EBF6 4px 8px);color:#4A6FA5")} aria-label={`${p.first_name} ${p.last_name} ${formatDate(d)} leave`}>leave</button>;
    if (OFF.has(type) || hours <= 0) return <button key={s.id} type="button" disabled={disabled} onClick={() => onCell(p, d, s)} className={`${cell} text-[12px] text-muted-foreground`} aria-label={`${p.first_name} ${p.last_name} ${formatDate(d)} off`}>–</button>;
    const start = s.start_time?.slice(0, 5), end = s.end_time?.slice(0, 5);
    const kind = shiftKind(start, end, hours, venueDayHours(periods, shiftVenue(s)?.id, d));
    return <button key={s.id} type="button" disabled={disabled} onClick={() => onCell(p, d, s)} className={`${cell} flex-col leading-[1.1] tabular-nums tracking-[-0.02em]`} style={css(TONE[kind])} aria-label={`${p.first_name} ${p.last_name} ${formatDate(d)} ${start}–${end}`} title={`${p.first_name} ${p.last_name} · ${start}–${end}`}>
      <b className="text-[10px] font-semibold">{start}</b><span className="text-[10px]">{end}</span>
    </button>;
  };
  return <div className="min-[641px]:hidden kit" aria-label="Rota week">
    <div className="flex items-end pb-1.5 px-0.5">
      <span className="w-[64px] shrink-0" />
      <span className="flex gap-px">{days.map(d => { const dt = new Date(`${d}T00:00:00Z`), sh = holidays.some(h => h.is_active && h.date === d); return <span key={d} className={`w-[34px] text-center text-[10px] leading-tight ${sh ? "text-warning" : "text-muted-foreground"}`}>{dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}<br /><b className="text-[12px] font-semibold text-foreground">{dt.getUTCDate()}</b></span>; })}</span>
      <span className="w-[28px] shrink-0 text-right text-[10px] text-muted-foreground">Hrs</span>
    </div>
    {grouped.map(group => <Fragment key={group}>
      <p className="mt-2 mb-0.5 px-0.5 text-[11px] font-medium text-muted-foreground">{group}</p>
      {people.filter(p => roleGroup(p.job_title, rolesMap) === group).map(p => {
        const hours = allShifts.filter(s => s.employee_id === p.id && days.includes(s.shift_date)).reduce((n, s) => n + shiftHours(s), 0);
        return <div key={p.id} className="flex items-center py-[3px] px-0.5 border-t border-border/60">
          <span className="w-[64px] shrink-0 pr-1 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis" title={`${p.first_name} ${p.last_name}`}>{p.first_name}</span>
          <span className="flex gap-px">{days.map(d => {
            const rows = shifts.filter(s => s.employee_id === p.id && s.shift_date === d), request = leaveOnDay(leave, p.id, d);
            return <span key={d} className="flex flex-col gap-px w-[34px]">{rows.length ? rows.map(s => tag(s, p, d))
              : request ? <button type="button" disabled={disabled} onClick={() => onCell(p, d)} className={`${cell} text-[9px] font-semibold`} style={css("background:repeating-linear-gradient(135deg,#EEF4FB 0 4px,#E2EBF6 4px 8px);color:#4A6FA5")} aria-label={`${p.first_name} ${p.last_name} ${formatDate(d)} ${leaveCode(request.leave_type?.name ?? "Leave")}`}>leave</button>
              : <button type="button" disabled={disabled} onClick={() => onCell(p, d)} className={`${cell} text-[12px] text-[#B9C2BD]`} aria-label={`${p.first_name} ${p.last_name} ${formatDate(d)} add shift`}>–</button>}</span>;
          })}</span>
          <span className="w-[28px] shrink-0 text-right text-[12px] td-num">{formatDecimal(hours, 0)}</span>
        </div>;
      })}
    </Fragment>)}
    {!people.length && <p className="p-8 text-center text-sm text-muted-foreground">No people or shifts.</p>}
    <div className="flex items-center pt-1.5 mt-1 px-0.5 border-t border-border">
      <span className="w-[64px] shrink-0 text-[11px] text-muted-foreground">On</span>
      <span className="flex gap-px">{days.map(d => <span key={d} className="w-[34px] text-center text-[11px] font-semibold td-num">{new Set(shifts.filter(s => s.shift_date === d && shiftHours(s) > 0).map(s => s.employee_id)).size}</span>)}</span>
      <span className="w-[28px]" />
    </div>
    <p className="mt-2 px-0.5 text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis"><span style={{ color: "#1F6B5E" }}>■</span> opens <span style={{ color: "#2B5A9B" }}>■</span> closes <span style={{ color: "#8A420B" }}>■</span> over 10 h <span style={{ color: "#9AA59F" }}>■</span> middle</p>
  </div>;
}
