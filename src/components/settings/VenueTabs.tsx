import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { notifySeatHistoryChanged, type SeatHistoryEntry } from "@/hooks/useSeatHistory";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";
import { useRevenueTargetMutations } from "@/hooks/useRevenueTargetMutations";
import { useRevenueTargetPermissions } from "@/hooks/useRevenueTargetPermissions";
import { useVenueClosures } from "@/hooks/useVenueClosures";
import { weekdayName } from "@/utils/venueClosures";
import type { VenueServicePeriod } from "@/types/revenueTargetsV2";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SettingsCard, Row, Field, SaveBar } from "./SettingsForm";

// Settings › Venues › one venue: each tab is plain Settings cards. Tables on computer, two-line rows on phone.

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

export const shortDate = (s: string) => day(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const longDate = (s: string) => `${day(s).toLocaleDateString("en-GB", { weekday: "short" })} ${shortDate(s)}`;
/** "16:00:00" → "4:00 pm" */
export function clock(t: string | null | undefined) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
/** Every day, Weekdays, Weekends or "Mon, Tue". */
export function daysText(days: number[]) {
  const s = [...new Set(days)].sort();
  if (s.length === 7) return "Every day";
  if (s.join() === "1,2,3,4,5") return "Weekdays";
  if (s.join() === "0,6") return "Weekends";
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => s.includes(d)).map((d) => weekdayName(d).slice(0, 3)).join(", ");
}
/** Hours a period covers, e.g. "4:00 pm – 4:00 am next day" or "All day". */
export function hoursText(p: Pick<VenueServicePeriod, "startTime" | "endTime" | "crossesMidnight">) {
  if (p.startTime?.startsWith("00:00") && p.endTime?.startsWith("23:59")) return "All day";
  return `${clock(p.startTime)} – ${clock(p.endTime)}${p.crossesMidnight ? " next day" : ""}`;
}
const sourceText = (s: string) => (s === "manual" ? "Typed in" : s === "your_team" ? "Your team" : s.replace(/_/g, " "));

/** Rows: a table on computer, two lines per row on phone. */
function List({ head, rows, empty }: { head: string[]; rows: { key: string; cells: ReactNode[]; title: ReactNode; sub: ReactNode; right?: ReactNode; onOpen?: () => void }[]; empty: string }) {
  const phone = useIsMobile();
  if (!rows.length) return <p className="text-[13px] text-muted-foreground">{empty}</p>;
  if (phone) return <ul className="border-t border-border">{rows.map((r) => <li key={r.key}>
    <button type="button" disabled={!r.onOpen} onClick={r.onOpen} className="flex min-h-[48px] w-full items-center justify-between gap-3 border-b border-border/60 py-1.5 text-left">
      <span className="min-w-0"><span className="block truncate text-[14px]">{r.title}</span><span className="block text-[12px] text-muted-foreground">{r.sub}</span></span>
      {r.right != null && <span className="shrink-0 text-[14px] tabular-nums text-muted-foreground">{r.right}</span>}
    </button></li>)}</ul>;
  return <div className="overflow-x-auto"><table className="w-full text-[13px]">
    <thead className="border-b border-border text-[12px] text-muted-foreground"><tr>{head.map((h, i) => <th key={h} className={`h-9 pr-3 font-normal ${i === head.length - 1 && /^(Seats|Products)$/.test(h) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r) => <tr key={r.key} onClick={r.onOpen} className={`h-11 whitespace-nowrap border-b border-border/50 ${r.onOpen ? "cursor-pointer hover:bg-muted/40" : ""}`}>{r.cells.map((c, i) => <td key={i} className="pr-3">{c}</td>)}</tr>)}</tbody>
  </table></div>;
}

export function VenueSeatsTab({ venueId, tenantId, history, onSaved }: { venueId: string; tenantId: string | null; history: SeatHistoryEntry[]; onSaved: () => void }) {
  const { user } = useAuth();
  const today = iso(new Date());
  const current = history.find((h) => h.effective_from <= today) ?? null;
  const [editing, setEditing] = useState(false);
  const [seats, setSeats] = useState("");
  const [from, setFrom] = useState(today);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const n = Number(seats);
    if (!Number.isInteger(n) || n <= 0) { toast.error("Enter a whole number of seats above 0"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !tenantId) { toast.error("Pick the date it starts"); return; }
    setSaving(true);
    const { error } = await supabase.from("venue_seat_history").upsert(
      { tenant_id: tenantId, venue_id: venueId, seats: n, effective_from: from, created_by: user?.id ?? null }, { onConflict: "venue_id,effective_from" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${n} seats from ${shortDate(from)}`);
    setEditing(false); setSeats(""); notifySeatHistoryChanged(); onSaved();
  };
  return <>
    <SettingsCard title="Seats" editing={editing} onEdit={() => { setSeats(current ? String(current.seats) : ""); setFrom(today); setEditing(true); }}>
      {editing ? <>
        <Field label="Seats" htmlFor="seats-n"><Input id="seats-n" type="number" min={1} inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} /></Field>
        <Field label="From" htmlFor="seats-from"><Input id="seats-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <SaveBar dirty={!!seats.trim()} saving={saving} onSave={() => void save()} onCancel={() => setEditing(false)} />
      </> : <>
        <Row label="Seats now" value={current ? String(current.seats) : undefined} missing="Not set" />
        <Row label="Since" value={current ? shortDate(current.effective_from) : undefined} />
      </>}
    </SettingsCard>
    {history.length > 0 && <SettingsCard title="History">
      <List head={["From", "Seats"]} empty="" rows={history.map((h) => ({
        key: h.id, title: shortDate(h.effective_from), sub: h.effective_from > today ? "Coming up" : h === current ? "Now" : "Earlier", right: h.seats,
        cells: [<span key="d">{shortDate(h.effective_from)}{h.effective_from > today && <span className="ml-2 text-muted-foreground">coming up</span>}</span>, <span key="s" className="block text-right tabular-nums">{h.seats}</span>],
      }))} />
    </SettingsCard>}
  </>;
}

type PeriodForm = { id?: string; name: string; start: string; end: string; days: number[]; from: string; sortOrder: number };

export function VenuePeriodsTab({ venueId, onChanged }: { venueId: string; onChanged?: () => void }) {
  const { rows, refetch } = useVenueServicePeriods([venueId]);
  const { upsertServicePeriod, deactivateServicePeriod } = useRevenueTargetMutations();
  const { canEditManagerTargets: canEdit } = useRevenueTargetPermissions();
  const [form, setForm] = useState<PeriodForm | null>(null);
  const [saving, setSaving] = useState(false);
  const live = rows.filter((r) => r.venueId === venueId && r.isActive).sort((a, b) => Number(a.isRollupOnly) - Number(b.isRollupOnly) || a.sortOrder - b.sortOrder || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const ended = rows.filter((r) => r.venueId === venueId && !r.isActive);
  const open = (p?: VenueServicePeriod) => setForm(p
    ? { id: p.id, name: p.name, start: p.startTime.slice(0, 5), end: p.endTime.slice(0, 5), days: p.applicableWeekdays, from: p.effectiveFrom ?? iso(new Date()), sortOrder: p.sortOrder }
    : { name: "", start: "12:00", end: "15:00", days: [0, 1, 2, 3, 4, 5, 6], from: iso(new Date()), sortOrder: live.length + 1 });
  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { toast.error("Add a name"); return; }
    if (!form.days.length) { toast.error("Pick at least one day"); return; }
    setSaving(true);
    const res = await upsertServicePeriod({ id: form.id, venueId, name: form.name.trim(), startTime: form.start, endTime: form.end, crossesMidnight: form.end <= form.start,
      applicableWeekdays: form.days, isActive: true, sortOrder: form.sortOrder, effectiveFrom: form.from, effectiveTo: null });
    setSaving(false);
    if (res.ok) { toast.success(form.id ? "Service period saved" : "Service period added"); setForm(null); refetch(); onChanged?.(); }
  };
  const stop = async () => {
    if (!form?.id) return;
    const res = await deactivateServicePeriod(form.id);
    if (res.ok) { toast.success("Service period stopped"); setForm(null); refetch(); onChanged?.(); }
  };
  const row = (p: VenueServicePeriod) => ({
    key: p.id, title: p.isRollupOnly ? "Full day" : p.name,
    sub: p.isRollupOnly ? "All day · For comparisons only" : `${hoursText(p)} · ${daysText(p.applicableWeekdays)}`,
    right: !p.isRollupOnly && p.effectiveFrom ? `Since ${day(p.effectiveFrom).getFullYear()}` : undefined,
    onOpen: canEdit && !p.isRollupOnly && p.isActive ? () => open(p) : undefined,
    cells: [<span key="n" className="font-medium">{p.isRollupOnly ? "Full day" : p.name}</span>, p.isRollupOnly ? "All day" : hoursText(p), daysText(p.applicableWeekdays),
      <span key="s" className="text-muted-foreground">{p.isRollupOnly ? "For comparisons only" : p.effectiveFrom ? shortDate(p.effectiveFrom) : ""}{!p.isActive && p.effectiveTo ? ` – ${shortDate(p.effectiveTo)}` : ""}</span>],
  });
  return <>
    <SettingsCard title="Service periods" action={canEdit ? <button type="button" className="settings-edit" onClick={() => open()}>Add</button> : undefined}>
      <List head={["Period", "Hours", "Days", "Since"]} empty="No service periods yet." rows={live.map(row)} />
    </SettingsCard>
    {ended.length > 0 && <SettingsCard title="Ended"><List head={["Period", "Hours", "Days", "Dates"]} empty="" rows={ended.map(row)} /></SettingsCard>}
    <Dialog open={!!form} onOpenChange={(o) => !o && !saving && setForm(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>{form?.id ? form.name : "New service period"}</DialogTitle></DialogHeader>
        {form && <div className="space-y-3.5">
          <Stacked label="Name" htmlFor="sp-name"><Input id="sp-name" className="h-10 text-[14px]" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lunch" /></Stacked>
          <div className="grid grid-cols-2 gap-3">
            <Stacked label="Starts" htmlFor="sp-start"><Input id="sp-start" type="time" className="h-10 text-[14px]" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Stacked>
            <Stacked label={form.end <= form.start ? "Ends · next day" : "Ends"} htmlFor="sp-end"><Input id="sp-end" type="time" className="h-10 text-[14px]" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Stacked>
          </div>
          <Stacked label="Days">
            <div className="grid grid-cols-7 gap-1.5">{[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = form.days.includes(d);
              return <button key={d} type="button" aria-pressed={on} onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== d) : [...form.days, d] })}
                className={`h-9 rounded-lg border text-[13px] ${on ? "border-[rgba(31,107,94,0.35)] bg-[rgba(31,107,94,0.1)] font-semibold text-[#1F6B5E]" : "border-border bg-white text-muted-foreground"}`}>{weekdayName(d).slice(0, 3)}</button>;
            })}</div>
          </Stacked>
          <Stacked label="From" htmlFor="sp-from"><Input id="sp-from" type="date" className="h-10 text-[14px]" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Stacked>
          <div className="flex items-center gap-2 pt-1">
            {form.id && <Button variant="ghost" className="mr-auto text-destructive hover:text-destructive" disabled={saving} onClick={() => void stop()}>Stop using it</Button>}
            <Button variant="outline" className="ml-auto rounded-full" disabled={saving} onClick={() => setForm(null)}>Cancel</Button>
            <Button disabled={saving} className="rounded-full bg-[#1F6B5E] text-white hover:bg-[#1A5C51]" onClick={() => void save()}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}

/** A pop-up field: label above the box, full width (pop-ups are too narrow for label-beside-field rows). */
function Stacked({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return <div className="min-w-0"><label htmlFor={htmlFor} className="mb-1.5 block text-[13px] text-muted-foreground">{label}</label>{children}</div>;
}

export function VenueClosuresTab({ venueId, venueName }: { venueId: string; venueName: string }) {
  const { closures, rules, addRule, removeRule, markClosed, unmark } = useVenueClosures([venueId]);
  const [adding, setAdding] = useState<null | "weekday" | "range" | "day">(null);
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState(iso(new Date()));
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<{ kind: "rule"; id: string; text: string } | { kind: "day"; date: string; text: string } | null>(null);
  const days = useMemo(() => [...closures].filter((c) => c.venue_id === venueId).sort((a, b) => b.date.localeCompare(a.date)), [closures, venueId]);
  const mine = rules.filter((r) => r.venue_id === venueId);
  const ruleText = (r: (typeof rules)[number]) => r.weekday != null
    ? `Every ${weekdayName(r.weekday)}${r.end_date ? ` until ${shortDate(r.end_date)}` : ""}`
    : `${shortDate(r.start_date)} – ${shortDate(r.end_date!)}`;
  const save = async () => {
    if (adding === "range" && (!end || end < start)) { toast.error("Pick an end date on or after the start date"); return; }
    const ok = adding === "day"
      ? await markClosed(venueId, start, reason.trim() || null, null)
      : await addRule({ venue_id: venueId, weekday: adding === "weekday" ? weekday : null, start_date: start, end_date: adding === "range" ? end : null, reason: reason.trim() || null });
    if (ok) { toast.success("Closure saved"); setAdding(null); setReason(""); setEnd(""); } else toast.error("Couldn't save. Only admins and managers with this venue can.");
  };
  const remove = async () => {
    if (!picked) return;
    const ok = picked.kind === "rule" ? await removeRule(picked.id) : await unmark(venueId, picked.date);
    if (ok) { toast.success("Closure removed"); setPicked(null); } else toast.error("Couldn't remove it");
  };
  const openAdd = (k: "weekday" | "range" | "day") => { setStart(iso(new Date())); setEnd(""); setReason(""); setAdding(k); };
  return <>
    <SettingsCard title="Regular closures" action={<span className="flex gap-3"><button type="button" className="settings-edit" onClick={() => openAdd("weekday")}>Add a weekday</button><button type="button" className="settings-edit" onClick={() => openAdd("range")}>Add dates</button></span>}>
      <List head={["When", "From", "Reason"]} empty={`None. ${venueName} opens every day.`} rows={mine.map((r) => ({
        key: r.id, title: ruleText(r), sub: [r.weekday != null ? `From ${shortDate(r.start_date)}` : "", r.reason ?? ""].filter(Boolean).join(" · ") || "No reason given",
        onOpen: () => setPicked({ kind: "rule", id: r.id, text: ruleText(r) }),
        cells: [<span key="w" className="font-medium">{ruleText(r)}</span>, <span key="f" className="text-muted-foreground">{shortDate(r.start_date)}</span>, r.reason ?? <span key="r" className="text-muted-foreground">—</span>],
      }))} />
    </SettingsCard>
    <SettingsCard title="Closed days" action={<button type="button" className="settings-edit" onClick={() => openAdd("day")}>Add</button>}>
      <List head={["Date", "Reason", "Added by"]} empty="No closed days recorded." rows={days.map((c) => ({
        key: c.id, title: longDate(c.date), sub: [c.reason || "No reason given", sourceText(c.source)].join(" · "),
        onOpen: () => setPicked({ kind: "day", date: c.date, text: longDate(c.date) }),
        cells: [longDate(c.date), c.reason || <span key="r" className="text-muted-foreground">—</span>, <span key="s" className="text-muted-foreground">{sourceText(c.source)}</span>],
      }))} />
    </SettingsCard>
    <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>{adding === "day" ? "Closed day" : adding === "weekday" ? "Closed every week" : "Closed for some dates"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {adding === "weekday" && <Field label="Day"><select aria-label="Weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="h-10 w-full rounded-md border border-border bg-white px-2 text-[13px]">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>Every {weekdayName(d)}</option>)}</select></Field>}
          <Field label={adding === "day" ? "Date" : adding === "weekday" ? "Starting" : "From"} htmlFor="cl-start"><Input id="cl-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          {adding === "range" && <Field label="To" htmlFor="cl-end"><Input id="cl-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>}
          <Field label="Reason" htmlFor="cl-reason"><Input id="cl-reason" placeholder="Optional" maxLength={100} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(null)}>Cancel</Button><Button onClick={() => void save()}>Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>{picked?.text}</DialogTitle></DialogHeader>
        <p className="text-[13px]">Remove this closure? Sales checks will expect {venueName} to be open {picked?.kind === "day" ? "that day" : "on those days"}.</p>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPicked(null)}>Cancel</Button><Button variant="destructive" onClick={() => void remove()}>Remove</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}

export function VenueAreasTab({ venueId, venueName, tenantId, areas, onChanged }: { venueId: string; venueName: string; tenantId: string | null; areas: { id: string; name: string; is_active: boolean; venue_id: string }[]; onChanged: () => void }) {
  const [edit, setEdit] = useState<{ id?: string; name: string; active: boolean } | null>(null);
  const mine = areas.filter((a) => a.venue_id === venueId).sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));
  const save = async () => {
    if (!edit || !tenantId || !edit.name.trim()) return;
    const { error } = edit.id
      ? await supabase.from("stock_locations").update({ name: edit.name.trim(), is_active: edit.active }).eq("id", edit.id).eq("tenant_id", tenantId)
      : await supabase.from("stock_locations").insert({ tenant_id: tenantId, venue_id: venueId, venue: venueName, name: edit.name.trim(), sort_order: areas.length + 1 });
    if (error) { toast.error(error.message); return; }
    setEdit(null); onChanged();
  };
  return <>
    <SettingsCard title="Stock areas" action={<button type="button" className="settings-edit" onClick={() => setEdit({ name: "", active: true })}>Add</button>}>
      <List head={["Area", "Status"]} empty="No stock areas yet. Add the places you count stock, like Kitchen or Bar." rows={mine.map((a) => ({
        key: a.id, title: a.name, sub: a.is_active ? "In use" : "Archived", onOpen: () => setEdit({ id: a.id, name: a.name, active: a.is_active }),
        cells: [<span key="n" className="font-medium">{a.name}</span>, <span key="s" className="text-muted-foreground">{a.is_active ? "In use" : "Archived"}</span>],
      }))} />
    </SettingsCard>
    <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>{edit?.id ? "Stock area" : "New stock area"}</DialogTitle></DialogHeader>
        {edit && <div className="space-y-3">
          <Field label="Name" htmlFor="area-name"><Input id="area-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Kitchen" /></Field>
          <div className="flex items-center gap-2">
            {edit.id && <Button variant="ghost" className="mr-auto" onClick={() => setEdit({ ...edit, active: !edit.active })}>{edit.active ? "Archive" : "Use again"}</Button>}
            <Button variant="outline" className="ml-auto" onClick={() => setEdit(null)}>Cancel</Button>
            <Button disabled={!edit.name.trim()} onClick={() => void save()}>Save</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}

export function VenueAddressCard({ venueId, tenantId, address, onSaved }: { venueId: string; tenantId: string | null; address: string; onSaved: (address: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(address);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!tenantId) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("save_venue_address", { t: tenantId, v: venueId, p_address: text.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Address saved");
    setEditing(false); onSaved(text.trim());
  };
  return <SettingsCard title="Address" editing={editing} onEdit={() => { setText(address); setEditing(true); }}>
    {editing ? <>
      <Field label="Address" htmlFor="venue-address"><Input id="venue-address" value={text} maxLength={300} placeholder="G/F, 18 Elgin Street, Central, Hong Kong" onChange={(e) => setText(e.target.value)} /></Field>
      <SaveBar dirty={text.trim() !== address} saving={busy} onSave={() => void save()} onCancel={() => setEditing(false)} />
    </> : <Row label="Address" value={address || undefined} missing="Not set" />}
  </SettingsCard>;
}

export function VenueLocationTab({ venueId, tenantId, lat, lng, onSaved }: { venueId: string; tenantId: string | null; lat: string; lng: string; onSaved: (lat: string, lng: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState(lat);
  const [b, setB] = useState(lng);
  const [busy, setBusy] = useState(false);
  const set = lat !== "" && lng !== "";
  const here = () => {
    if (!navigator.geolocation) { toast.error("This device can't share its location"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition((p) => { setA(p.coords.latitude.toFixed(6)); setB(p.coords.longitude.toFixed(6)); setBusy(false); },
      () => { toast.error("Allow location access, then try again"); setBusy(false); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  const save = async () => {
    const la = Number(a), lo = Number(b);
    if (!tenantId || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) { toast.error("Those coordinates don't look right"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("rota_save_location", { t: tenantId, v: venueId, lat: la, lng: lo });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Location saved"); window.dispatchEvent(new Event("people-settings-changed"));
    setEditing(false); onSaved(String(la), String(lo));
  };
  return <SettingsCard title="Location" editing={editing} onEdit={() => { setA(lat); setB(lng); setEditing(true); }}>
    {editing ? <>
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <Button variant="outline" className="rounded-full" disabled={busy} onClick={here}>{busy ? "Finding…" : "Use where I am now (at the venue)"}</Button>
        <span className="text-[13px] text-muted-foreground">or type the coordinates from Google Maps</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" htmlFor="loc-lat"><Input id="loc-lat" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <Field label="Longitude" htmlFor="loc-lng"><Input id="loc-lng" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      </div>
      <SaveBar dirty={!!a.trim() && !!b.trim() && (a !== lat || b !== lng)} saving={busy} onSave={() => void save()} onCancel={() => setEditing(false)} />
    </> : <>
      <Row label="Location" value={set ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : undefined} missing="Not set" />
      <Row label="Used for" value="Staff clock-in by phone" />
    </>}
  </SettingsCard>;
}
