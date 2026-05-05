import { TrendingUp, Users, ShoppingCart, DollarSign, Armchair, RotateCw, BarChart3 } from "lucide-react";
import { getVenueSeats } from "@/constants/venueSeating";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { formatCurrency, formatNumber } from "@/utils/format";

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

  const dailyRevPerSeat = seats && uniqueDays ? Math.round(totalSales / seats / uniqueDays) : 0;
  const dailySeatTurnover = seats && uniqueDays ? totalGuests / seats / uniqueDays : 0;
  const dailyOccupancy = seats && uniqueDays ? Math.round((totalGuests / (seats * uniqueDays)) * 100) : 0;

  const cards = [
    { label: "Total Sales", value: formatCurrency(totalSales), icon: DollarSign },
    { label: "Total Guests", value: formatNumber(totalGuests), icon: Users },
    { label: "Total Orders", value: formatNumber(totalOrders), icon: ShoppingCart },
    { label: "Avg / Guest", value: formatCurrency(avgPerGuest), icon: TrendingUp },
    { label: "Avg / Order", value: formatCurrency(avgPerOrder), icon: TrendingUp },
    { label: "Total Discount", value: formatCurrency(Math.abs(totalDiscount)), icon: DollarSign },
    { label: "Sales / Day", value: formatCurrency(salesPerDay), icon: DollarSign },
    { label: "Guests / Day", value: formatNumber(guestsPerDay), icon: Users },
    ...(seats ? [
      { label: "Orders / Day", value: formatNumber(ordersPerDay), icon: ShoppingCart },
      { label: "Rev / Seat / Day", value: formatCurrency(dailyRevPerSeat), icon: Armchair },
      { label: "Seat Turn / Day", value: `${dailySeatTurnover.toFixed(1)}x`, icon: RotateCw },
      { label: "Occupancy / Day", value: `${dailyOccupancy}%`, icon: BarChart3 },
    ] : []),
  ];

  return (
    <KpiGrid cols="grid-cols-2 sm:grid-cols-4">
      {cards.map((c) => (
        <KpiCard key={c.label} label={c.label} value={c.value} icon={c.icon} />
      ))}
    </KpiGrid>
  );
};

export default KPICards;
