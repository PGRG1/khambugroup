import { useState } from "react";
import { useEvents } from "@/hooks/useEvents";
import { useRevenueSources } from "@/hooks/useRevenueSources";
import { useVenuesConfig } from "@/hooks/useVenuesConfig";
import { EventRecord, EVENT_TYPES, EVENT_STATUSES, EVENT_TYPES_REQUIRING_LOCATION, EventType, EventStatus } from "@/types/event";
import { Plus, Trash2, X, CalendarDays } from "lucide-react";

const emptyEvent: Partial<EventRecord> = {
  name: "",
  eventType: "In-Venue Event",
  linkedVenue: null,
  externalLocation: null,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  servicePeriod: "",
  salesChannel: "",
  expectedGuests: null,
  forecastAvgSpend: null,
  forecastRevenue: null,
  actualGuests: null,
  actualRevenue: null,
  notes: "",
  status: "Planned",
  includeInDashboard: true,
};

const Events = () => {
  const { events, loading, addEvent, updateEvent, deleteEvent } = useEvents();
  const { sources, defaultSource } = useRevenueSources();
  const { venues } = useVenuesConfig();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<EventRecord>>(emptyEvent);

  const eventsSource = sources.find((s) => s.name === "Events") ?? defaultSource;

  const openNew = () => {
    setDraft({ ...emptyEvent, revenueSourceId: eventsSource?.id ?? null });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (ev: EventRecord) => {
    setDraft(ev);
    setEditingId(ev.id);
    setShowForm(true);
  };

  const physicalVenues = venues.filter((v) => v.venueType === "physical" && v.isActive);
  const requiresLocation =
    draft.linkedVenue === "Off-site / External" ||
    (draft.eventType && EVENT_TYPES_REQUIRING_LOCATION.includes(draft.eventType));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name || !draft.startDate || !draft.endDate) return;
    if (requiresLocation && !draft.externalLocation) {
      alert("External location is required for this event type.");
      return;
    }
    const payload = { ...draft, revenueSourceId: draft.revenueSourceId ?? eventsSource?.id ?? null };
    const ok = editingId ? await updateEvent(editingId, payload) : await addEvent(payload);
    if (ok) {
      setShowForm(false);
      setDraft(emptyEvent);
      setEditingId(null);
    }
  };

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">
            <span className="text-gradient-gold">Events</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{events.length} events · in-venue, off-site, pop-ups, catering</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Event
        </button>
      </div>

      {showForm && (
        <div className="card-glass rounded-xl p-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {editingId ? "Edit Event" : "New Event"}
            </h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Event Name *">
                <input required value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Event Type">
                <select value={draft.eventType || "In-Venue Event"} onChange={(e) => setDraft({ ...draft, eventType: e.target.value as EventType })} className={inputCls}>
                  {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Linked Venue">
                <select value={draft.linkedVenue || ""} onChange={(e) => setDraft({ ...draft, linkedVenue: e.target.value || null })} className={inputCls}>
                  <option value="">— None —</option>
                  {physicalVenues.map((v) => <option key={v.name} value={v.name}>{v.displayLabel}</option>)}
                  <option value="Off-site / External">Off-site / External</option>
                </select>
              </Field>
              <Field label={`External Location ${requiresLocation ? "*" : ""}`}>
                <input value={draft.externalLocation || ""} onChange={(e) => setDraft({ ...draft, externalLocation: e.target.value || null })} className={inputCls} placeholder="e.g. Tamar Park, Grand Hyatt..." />
              </Field>
              <Field label="Start Date *">
                <input required type="date" value={draft.startDate || ""} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className={inputCls} />
              </Field>
              <Field label="End Date *">
                <input required type="date" value={draft.endDate || ""} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Service Period">
                <input value={draft.servicePeriod || ""} onChange={(e) => setDraft({ ...draft, servicePeriod: e.target.value })} className={inputCls} placeholder="Lunch / Dinner / Event" />
              </Field>
              <Field label="Sales Channel">
                <input value={draft.salesChannel || ""} onChange={(e) => setDraft({ ...draft, salesChannel: e.target.value })} className={inputCls} placeholder="Private Event / Pop-up / Catering" />
              </Field>
              <Field label="Expected Guests">
                <input type="number" value={draft.expectedGuests ?? ""} onChange={(e) => setDraft({ ...draft, expectedGuests: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </Field>
              <Field label="Forecast Avg Spend">
                <input type="number" step="0.01" value={draft.forecastAvgSpend ?? ""} onChange={(e) => setDraft({ ...draft, forecastAvgSpend: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </Field>
              <Field label="Forecast Revenue">
                <input type="number" step="0.01" value={draft.forecastRevenue ?? ""} onChange={(e) => setDraft({ ...draft, forecastRevenue: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </Field>
              <Field label="Actual Guests">
                <input type="number" value={draft.actualGuests ?? ""} onChange={(e) => setDraft({ ...draft, actualGuests: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </Field>
              <Field label="Actual Revenue">
                <input type="number" step="0.01" value={draft.actualRevenue ?? ""} onChange={(e) => setDraft({ ...draft, actualRevenue: e.target.value ? Number(e.target.value) : null })} className={inputCls} />
              </Field>
              <Field label="Status">
                <select value={draft.status || "Planned"} onChange={(e) => setDraft({ ...draft, status: e.target.value as EventStatus })} className={inputCls}>
                  {EVENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Event Notes">
              <textarea rows={2} value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputCls} />
            </Field>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={draft.includeInDashboard ?? true} onChange={(e) => setDraft({ ...draft, includeInDashboard: e.target.checked })} />
              Include in Revenue Dashboard
            </label>
            <button type="submit" className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90">
              {editingId ? "Save Changes" : "Create Event"}
            </button>
          </form>
        </div>
      )}

      <div className="card-glass rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading events...</p>
        ) : events.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No events yet. Click "New Event" to create one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Venue / Location</th>
                  <th className="text-left px-4 py-2.5 font-medium">Dates</th>
                  <th className="text-right px-4 py-2.5 font-medium">Forecast Rev</th>
                  <th className="text-right px-4 py-2.5 font-medium">Actual Rev</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-t border-border hover:bg-secondary/30 cursor-pointer" onClick={() => openEdit(ev)}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{ev.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{ev.eventType}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {ev.linkedVenue || "—"}{ev.externalLocation ? ` · ${ev.externalLocation}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground td-num">{ev.startDate}{ev.startDate !== ev.endDate ? ` → ${ev.endDate}` : ""}</td>
                    <td className="px-4 py-2.5 text-right td-num text-muted-foreground">{ev.forecastRevenue?.toLocaleString() ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right td-num text-foreground">{ev.actualRevenue?.toLocaleString() ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`chip ${statusChip(ev.status)}`}><span></span>{ev.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${ev.name}"?`)) deleteEvent(ev.id); }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const inputCls = "w-full px-3 py-1.5 text-sm rounded-md border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-xs text-muted-foreground">{label}</label>
    {children}
  </div>
);

const statusChip = (s: string) => {
  switch (s) {
    case "Active": return "chip-info";
    case "Completed": return "chip-success";
    case "Cancelled": return "chip-danger";
    default: return "chip-neutral";
  }
};

export default Events;
