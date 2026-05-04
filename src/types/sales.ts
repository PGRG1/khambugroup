export type VenueName = "Assembly" | "Caliente" | "Hanabi" | "Events" | "Off-site / External";

export interface SalesRecord {
  date: string;
  day: string;
  venue: VenueName;
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
  // Phase 2 extension fields (all optional, additive)
  revenueSourceId?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  externalLocation?: string | null;
  servicePeriod?: string | null;
  salesChannel?: string | null;
}

export type VenueFilter = "All Venues" | VenueName;

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}
