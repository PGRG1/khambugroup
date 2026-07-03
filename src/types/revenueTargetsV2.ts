// Phase 2 shared types for Revenue Targets v2.
// Contracts documented in .lovable/plan.md and Phase 1 correction migration.

export type OperatingStatus = "normal" | "mixed" | "events_only" | "closed";
export type LineType = "service_period" | "event";
export type EventMode =
  | "additive"
  | "replaces_period"
  | "events_only"
  | "partial_replacement";
export type LineStatus =
  | "operating"
  | "not_operating"
  | "replaced_by_event"
  | "closed";
export type TargetInputMode = "drivers" | "contracted_revenue";
export type ManagerLineStatus = "draft" | "saved" | "approved";
export type Confidence = "high" | "low" | "unavailable";
export type ActualCoverage = "service_period" | "full_day_only" | "unavailable";

export interface VenueServicePeriod {
  id: string;
  tenantId: string;
  venueId: string;
  name: string;
  code: string | null;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  applicableWeekdays: number[];
  isActive: boolean;
  sortOrder: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** true = benchmark/roll-up container only. Never operational. */
  isRollupOnly: boolean;
}

export interface RevenueTargetDay {
  id: string;
  tenantId: string;
  venueId: string;
  targetDate: string;
  operatingStatus: OperatingStatus;
  notes: string | null;
}

export interface ManagerTargetLine {
  id: string;
  tenantId: string;
  venueId: string;
  targetDate: string;
  lineType: LineType;
  servicePeriodId: string | null;
  eventName: string | null;
  eventType: string | null;
  eventMode: EventMode | null;
  replacesServicePeriodId: string | null;
  venueArea: string | null;
  eventStartTime: string | null;
  eventEndTime: string | null;
  targetInputMode: TargetInputMode;
  managerGuestTarget: number | null;
  managerSpendPerGuestTarget: number | null;
  managerRevenueOverride: number | null;
  /** DB-generated (guests * spg). Not set for contracted_revenue mode. */
  managerRevenueTarget: number | null;
  lineStatus: LineStatus;
  zeroReason: string | null;
  managerSource: string | null;
  status: ManagerLineStatus;
  notes: string | null;
}

export interface StatisticalDailyRowV2 {
  id: string;
  tenantId: string;
  venueId: string;
  venueNameSnapshot: string;
  servicePeriodId: string | null;
  servicePeriodNameSnapshot: string | null;
  targetDate: string;
  statisticalTargetAmount: number;
  statisticalGuestTarget: number | null;
  statisticalSpendPerGuest: number | null;
  model: string;
  modelVersion: string;
  lookbackStart: string;
  lookbackEnd: string;
  observationCount: number;
  revenueObservationCount: number;
  guestObservationCount: number;
  confidence: Confidence;
  generatedAt: string;
  generatedBy: string | null;
}

export interface ActualDailyRow {
  venueId: string;
  targetDate: string;
  revenue: number;
  guests: number;
  spendPerGuest: number | null;
  /** Current source only supports 'full_day_only'. */
  coverage: ActualCoverage;
}
