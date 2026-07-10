export interface SalesRecord {
  id?: string;
  date: string;
  day: string;
  /** Venue name — must match `venues.name` in the master table. */
  venue: string;
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
  servicePeriodId?: string | null;
}

/** Venue filter: either "All Venues" or any active venue name from the master table. */
export type VenueFilter = string;

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}
