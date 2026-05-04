export type ForecastStatus = "draft" | "pending_approval" | "approved";

export interface ForecastRecord {
  id: string;
  date: string;
  day: string;
  venue: "Assembly" | "Caliente" | "Hanabi" | "Events" | "Off-site / External";
  // Phase 2 extension fields (all optional, additive)
  revenueSourceId?: string | null;
  eventId?: string | null;
  externalLocation?: string | null;
  servicePeriod?: string | null;
  salesChannel?: string | null;
  forecastedCustomers: number;
  forecastedAvgSpend: number;
  forecastedGrossSales: number;
  forecastedServiceCharge: number;
  forecastedTotalSales: number;
  comment: string;
  forecastNotes: string;
  postEventNotes: string;
  pendingPostEventNotes: string | null;
  status: ForecastStatus;
  submittedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface ForecastWithActuals extends ForecastRecord {
  actualCustomers: number | null;
  actualAvgSpend: number | null;
  actualTotalSales: number | null;
  customerVariance: number | null;
  avgSpendVariance: number | null;
  totalSalesVariance: number | null;
}
