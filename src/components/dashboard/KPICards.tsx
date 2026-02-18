import { formatCurrency } from "@/utils/salesUtils";
import { TrendingUp, Users, ShoppingCart, DollarSign } from "lucide-react";

interface KPICardsProps {
  totalSales: number;
  totalGuests: number;
  totalOrders: number;
  avgPerGuest: number;
  avgPerOrder: number;
  totalDiscount: number;
  salesPerDay: number;
  guestsPerDay: number;
  ordersPerDay: number;
}

const KPICards = ({ totalSales, totalGuests, totalOrders, avgPerGuest, avgPerOrder, totalDiscount, salesPerDay, guestsPerDay, ordersPerDay }: KPICardsProps) => {
  const cards = [
    { label: "Total Sales", value: `$${formatCurrency(totalSales)}`, sub: `$${formatCurrency(salesPerDay)} / day`, icon: DollarSign, color: "text-primary" },
    { label: "Total Guests", value: formatCurrency(totalGuests), sub: `${formatCurrency(guestsPerDay)} / day`, icon: Users, color: "text-chart-3" },
    { label: "Total Orders", value: formatCurrency(totalOrders), sub: `${formatCurrency(ordersPerDay)} / day`, icon: ShoppingCart, color: "text-chart-2" },
    { label: "Avg / Guest", value: `$${formatCurrency(avgPerGuest)}`, icon: TrendingUp, color: "text-primary" },
    { label: "Avg / Order", value: `$${formatCurrency(avgPerOrder)}`, icon: TrendingUp, color: "text-chart-4" },
    { label: "Total Discount", value: `$${formatCurrency(Math.abs(totalDiscount))}`, icon: DollarSign, color: "text-destructive" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="card-glass rounded-xl p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <c.icon className={`h-4 w-4 ${c.color}`} />
            <span className="text-xs text-muted-foreground">{c.label}</span>
          </div>
          <p className="text-xl font-display font-bold text-foreground">{c.value}</p>
          {c.sub && (
            <p className="text-xs text-muted-foreground/70 mt-1">{c.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default KPICards;
