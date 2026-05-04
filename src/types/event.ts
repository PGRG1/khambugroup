export type EventType =
  | "In-Venue Event"
  | "External Stall"
  | "Pop-up"
  | "Catering"
  | "Private Dining"
  | "Corporate Event"
  | "Festival"
  | "Takeaway Booth"
  | "Other";

export type EventStatus = "Planned" | "Active" | "Completed" | "Cancelled";

export const EVENT_TYPES: EventType[] = [
  "In-Venue Event",
  "External Stall",
  "Pop-up",
  "Catering",
  "Private Dining",
  "Corporate Event",
  "Festival",
  "Takeaway Booth",
  "Other",
];

export const EVENT_STATUSES: EventStatus[] = ["Planned", "Active", "Completed", "Cancelled"];

export const EVENT_TYPES_REQUIRING_LOCATION: EventType[] = [
  "External Stall",
  "Pop-up",
  "Catering",
  "Festival",
  "Takeaway Booth",
];

export interface EventRecord {
  id: string;
  name: string;
  eventType: EventType;
  linkedVenue: string | null;
  externalLocation: string | null;
  startDate: string;
  endDate: string;
  revenueSourceId: string | null;
  servicePeriod: string | null;
  salesChannel: string | null;
  expectedGuests: number | null;
  forecastAvgSpend: number | null;
  forecastRevenue: number | null;
  actualGuests: number | null;
  actualRevenue: number | null;
  notes: string;
  status: EventStatus;
  includeInDashboard: boolean;
  createdBy: string | null;
  createdAt: string;
}
