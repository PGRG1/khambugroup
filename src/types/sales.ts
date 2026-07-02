export interface SalesRecord {
  id?: string;
  date: string;
  day: string;
  venue: "Assembly" | "Caliente" | "Hanabi" | "Events";
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
  jcb: number;
  alipay: number;
  wechat: number;
  payme: number;
  cash: number;
  cardTips: number;
  receiptFileUrl?: string | null;
  receiptFileName?: string | null;
}

export type VenueFilter = "All Venues" | "Assembly" | "Caliente" | "Hanabi" | "Events";

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}
