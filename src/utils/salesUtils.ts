import { SalesRecord, VenueFilter } from "@/types/sales";
import { z } from "zod";

const SalesRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.string().trim().min(1).max(10),
  venue: z.enum(["Assembly", "Caliente", "Hanabi", "Events"]),
  reportNumber: z.string().trim().max(50),
  orders: z.number().int().min(0).max(100000),
  guests: z.number().int().min(0).max(100000),
  subtotal: z.number().min(0).max(100000000),
  serviceCharge: z.number().min(0).max(100000000),
  discount: z.number().min(-100000000).max(100000000),
  totalSales: z.number().min(0).max(100000000),
  visa: z.number().min(0).max(100000000),
  mastercard: z.number().min(0).max(100000000),
  amex: z.number().min(0).max(100000000),
  unionPay: z.number().min(0).max(100000000),
  jcb: z.number().min(0).max(100000000),
  alipay: z.number().min(0).max(100000000),
  wechat: z.number().min(0).max(100000000),
  cash: z.number().min(0).max(100000000),
  cardTips: z.number().min(0).max(100000000),
});

export function filterData(
  data: SalesRecord[],
  venue: VenueFilter,
  from?: Date,
  to?: Date
): SalesRecord[] {
  return data.filter((r) => {
    if (venue !== "All Venues" && r.venue !== venue) return false;
    if (from && new Date(r.date) < from) return false;
    if (to) {
      const recordDate = new Date(r.date);
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      if (recordDate > toEnd) return false;
    }
    return true;
  });
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function getMonthKey(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthLabel(key: string): string {
  const [y, m] = key.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${y}`;
}

const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function getDayOfWeekStats(data: SalesRecord[], seats?: number | null) {
  const months = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();

  const result = dayOrder.map((day) => {
    const entry: Record<string, string | number> = { day };
    months.forEach((month) => {
      const records = data.filter((r) => r.day === day && getMonthKey(r.date) === month);
      if (records.length > 0) {
        const byDate = new Map<string, { sales: number; guests: number; orders: number }>();
        records.forEach((r) => {
          const existing = byDate.get(r.date);
          if (existing) {
            existing.sales += r.totalSales;
            existing.guests += r.guests;
            existing.orders += r.orders;
          } else {
            byDate.set(r.date, { sales: r.totalSales, guests: r.guests, orders: r.orders });
          }
        });
        const numDays = byDate.size;
        const totalSales = Array.from(byDate.values()).reduce((s, d) => s + d.sales, 0);
        const totalGuests = Array.from(byDate.values()).reduce((s, d) => s + d.guests, 0);
        const totalOrders = Array.from(byDate.values()).reduce((s, d) => s + d.orders, 0);
        entry[`sales_${month}`] = Math.round(totalSales / numDays);
        entry[`guests_${month}`] = Math.round(totalGuests / numDays);
        entry[`spendPerGuest_${month}`] = totalGuests ? Math.round(totalSales / totalGuests) : 0;
        entry[`spendPerOrder_${month}`] = totalOrders ? Math.round(totalSales / totalOrders) : 0;
        if (seats && seats > 0) {
          const avgDailySales = totalSales / numDays;
          const avgDailyGuests = totalGuests / numDays;
          entry[`revPerSeat_${month}`] = Math.round(avgDailySales / seats);
          entry[`seatTurnover_${month}`] = parseFloat((avgDailyGuests / seats).toFixed(1));
          entry[`occupancy_${month}`] = Math.round((avgDailyGuests / seats) * 100);
        }
      }
    });
    return entry;
  });

  return { data: result, months };
}

export function getPaymentBreakdown(data: SalesRecord[]) {
  const methods = [
    { key: "visa", label: "VISA" },
    { key: "mastercard", label: "Mastercard" },
    { key: "amex", label: "AMEX" },
    { key: "unionPay", label: "Union Pay" },
    { key: "jcb", label: "JCB" },
    { key: "alipay", label: "Alipay" },
    { key: "wechat", label: "WeChat" },
    { key: "cash", label: "Cash" },
  ];

  return methods.map((m) => ({
    name: m.label,
    value: data.reduce((s, r) => s + (r[m.key as keyof SalesRecord] as number), 0),
  })).filter((m) => m.value > 0);
}

export function getVenueComparison(data: SalesRecord[]) {
  const venues = [...new Set(data.map((r) => r.venue))].sort();
  return venues.map((v) => {
    const records = data.filter((r) => r.venue === v);
    const totalSales = records.reduce((s, r) => s + r.totalSales, 0);
    const totalGuests = records.reduce((s, r) => s + r.guests, 0);
    const totalOrders = records.reduce((s, r) => s + r.orders, 0);
    return {
      venue: v,
      totalSales,
      totalGuests,
      totalOrders,
      avgPerGuest: totalGuests ? Math.round(totalSales / totalGuests) : 0,
      avgPerOrder: totalOrders ? Math.round(totalSales / totalOrders) : 0,
      days: records.length,
    };
  });
}

export function parseExcelRow(row: any[]): SalesRecord | null {
  try {
    const parseNum = (v: any) => {
      if (typeof v === "number") return v;
      if (typeof v === "string") return parseFloat(v.replace(/,/g, "")) || 0;
      return 0;
    };
    const parsePositive = (v: any) => Math.max(0, parseNum(v));
    
    const dateVal = row[0];
    let dateStr: string;
    if (dateVal instanceof Date) {
      dateStr = dateVal.toISOString().split("T")[0];
    } else if (typeof dateVal === "number") {
      const d = new Date((dateVal - 25569) * 86400 * 1000);
      dateStr = d.toISOString().split("T")[0];
    } else {
      dateStr = String(dateVal).trim().split("T")[0];
    }

    const venue = String(row[2]).trim();
    if (venue !== "Assembly" && venue !== "Caliente" && venue !== "Hanabi" && venue !== "Events") return null;

    const record = {
      date: dateStr,
      day: String(row[1]).trim().slice(0, 10),
      venue: venue as "Assembly" | "Caliente" | "Hanabi" | "Events",
      reportNumber: String(row[3]).trim().slice(0, 50),
      orders: parsePositive(row[4]),
      guests: parsePositive(row[5]),
      subtotal: parsePositive(row[6]),
      serviceCharge: parsePositive(row[7]),
      discount: parseNum(row[8]),
      totalSales: parsePositive(row[9]),
      visa: parsePositive(row[10]),
      mastercard: parsePositive(row[11]),
      amex: parsePositive(row[12]),
      unionPay: parsePositive(row[13]),
      jcb: parsePositive(row[14]),
      alipay: parsePositive(row[15]),
      wechat: parsePositive(row[16]),
      cash: parsePositive(row[17]),
      cardTips: parsePositive(row[18]),
    };

    const result = SalesRecordSchema.safeParse(record);
    return result.success ? result.data as SalesRecord : null;
  } catch {
    return null;
  }
}
