import { formatCurrency } from "@/utils/salesUtils";
import { TrendingUp, Users, ShoppingCart, DollarSign, Armchair, RotateCw, BarChart3 } from "lucide-react";
import { getVenueSeats } from "@/constants/venueSeating";

interface KPICardsProps {
  totalSales: number;
  totalGuests: number;
  totalOrders: number;
  avgPerGuest: number;
  avgPerOrder: number;
  totalDiscount: number;
  salesPerDay: number;
  guestsPerDay: number;
  venue?: string;
  uniqueDays?: number;
}

const KPICards = ({ totalSales, totalGuests, totalOrders, avgPerGuest, avgPerOrder, totalDiscount, salesPerDay, guestsPerDay, venue = "All Venues", uniqueDays = 1 }: KPICardsProps) => {
  const seats = venue !== "All Venues" ? getVenueSeats(venue) : null;
  const ordersPerDay = uniqueDays ? Math.round(totalOrders / uniqueDays) : 0;

  // Daily averages for seating metrics
  const dailyRevPerSeat = seats && uniqueDays ? Math.round(totalSales / seats / uniqueDays) : 0;
  const dailySeatTurnover = seats && uniqueDays ? (totalGuests / seats / uniqueDays).toFixed(1) : "0.0";
  const dailyOccupancy = seats && uniqueDays ? Math.round((totalGuests / (seats * uniqueDays)) * 100) : 0;

  const cards = [
    { label: "Total Sales", value: `${formatCurrency(totalSales)}`, icon: DollarSign, color: "text-primary" },
    { label: "Total Guests", value: formatCurrency(totalGuests), icon: Users, color: "text-chart-3" },
    { label: "Total Orders", value: formatCurrency(totalOrders), icon: ShoppingCart, color: "text-chart-2" },
    { label: "Avg / Guest", value: `${formatCurrency(avgPerGuest)}`, icon: TrendingUp, color: "text-primary" },
    { label: "Avg / Order", value: `${formatCurrency(avgPerOrder)}`, icon: TrendingUp, color: "text-chart-4" },
    { label: "Total Discount", value: `${formatCurrency(Math.abs(totalDiscount))}`, icon: DollarSign, color: "text-destructive" },
    { label: "Sales / Day", value: `${formatCurrency(salesPerDay)}`, icon: DollarSign, color: "text-primary" },
    { label: "Guests / Day", value: formatCurrency(guestsPerDay), icon: Users, color: "text-chart-3" },
    ...(seats ? [
      { label: "Orders / Day", value: formatCurrency(ordersPerDay), icon: ShoppingCart, color: "text-chart-2" },
      { label: "Rev / Seat / Day", value: `${formatCurrency(dailyRevPerSeat)}`, icon: Armchair, color: "text-chart-2" },
      { label: "Seat Turn / Day", value: dailySeatTurnover + "x", icon: RotateCw, color: "text-chart-4" },
      { label: "Occupancy % / Day", value: `${dailyOccupancy}%`, icon: BarChart3, color: "text-chart-3" },
    ] : []),
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3">
      {cards.map((c) => (
        <div key={c.label} className="card-glass rounded-lg sm:rounded-xl p-2 sm:p-4 animate-fade-in min-w-0">
          <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
            <c.icon className={`h-3 w-3 shrink-0 ${c.color}`} />
            <span className="text-[9px] sm:text-xs text-muted-foreground leading-tight">{c.label}</span>
          </div>
          <p className="text-xs sm:text-base font-display font-bold text-foreground leading-tight">{c.value}</p>
        </div>
      ))}
    </div>
  );
};

export default KPICards;
