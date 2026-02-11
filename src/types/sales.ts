export interface SalesRecord {
  date: string;
  day: string;
  venue: "Assembly" | "Caliente";
  reportNumber: string;
  orders: number;
  guests: number;
  subtotal: number;
  serviceCharge: number;
  discount: number;
  totalSales: number;
  visa: number;
  mastercard: number;
  amex: number;
  unionPay: number;
  alipay: number;
  wechat: number;
  cash: number;
  cardTips: number;
}

export type VenueFilter = "All Venues" | "Assembly" | "Caliente";

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}
