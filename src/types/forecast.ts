export interface ForecastRecord {
  id: string;
  date: string;
  day: string;
  venue: "Assembly" | "Caliente";
  forecastedCustomers: number;
  forecastedAvgSpend: number;
  forecastedGrossSales: number;
  forecastedServiceCharge: number;
  forecastedTotalSales: number;
  comment: string;
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
