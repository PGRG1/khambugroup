import { SalesRecord, VenueFilter } from "@/types/sales";

export function filterData(
  data: SalesRecord[],
  venue: VenueFilter,
  from?: Date,
  to?: Date
): SalesRecord[] {
  return data.filter((r) => {
    if (venue !== "All Venues" && r.venue !== venue) return false;
    if (from && new Date(r.date) < from) return false;
    if (to && new Date(r.date) > to) return false;
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

export function getDayOfWeekStats(data: SalesRecord[]) {
  const months = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();

  const result = dayOrder.map((day) => {
    const entry: Record<string, string | number> = { day };
    months.forEach((month) => {
      const records = data.filter((r) => r.day === day && getMonthKey(r.date) === month);
      if (records.length > 0) {
        entry[`guests_${month}`] = Math.round(records.reduce((s, r) => s + r.guests, 0) / records.length);
        entry[`spendPerGuest_${month}`] = Math.round(records.reduce((s, r) => s + r.totalSales / r.guests, 0) / records.length);
        entry[`spendPerOrder_${month}`] = Math.round(records.reduce((s, r) => s + r.totalSales / r.orders, 0) / records.length);
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
  const venues = ["Assembly", "Caliente"] as const;
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
    
    const dateVal = row[0];
    let dateStr: string;
    if (typeof dateVal === "number") {
      // Excel serial date
      const d = new Date((dateVal - 25569) * 86400 * 1000);
      dateStr = d.toISOString().split("T")[0];
    } else {
      dateStr = String(dateVal).split("T")[0];
    }

    const venue = String(row[2]).trim();
    if (venue !== "Assembly" && venue !== "Caliente") return null;

    return {
      date: dateStr,
      day: String(row[1]).trim(),
      venue: venue as "Assembly" | "Caliente",
      reportNumber: String(row[3]),
      orders: parseNum(row[4]),
      guests: parseNum(row[5]),
      subtotal: parseNum(row[6]),
      serviceCharge: parseNum(row[7]),
      discount: parseNum(row[8]),
      totalSales: parseNum(row[9]),
      visa: parseNum(row[10]),
      mastercard: parseNum(row[11]),
      amex: parseNum(row[12]),
      unionPay: parseNum(row[13]),
      alipay: parseNum(row[14]),
      wechat: parseNum(row[15]),
      cash: parseNum(row[16]),
      cardTips: parseNum(row[17]),
    };
  } catch {
    return null;
  }
}
