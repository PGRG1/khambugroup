export type VenueType = "physical" | "external" | "legacy";

export interface VenueConfig {
  name: string;
  displayLabel: string;
  venueType: VenueType;
  isActive: boolean;
  includeInDashboard: boolean;
  includeInForecasting: boolean;
  includeInInventory: boolean;
  includeInPayroll: boolean;
  historicalOnly: boolean;
  sortOrder: number;
}
