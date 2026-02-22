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
}

const KPICards = ({ totalSales, totalGuests, totalOrders, avgPerGuest, avgPerOrder, totalDiscount, salesPerDay, guestsPerDay }: KPICardsProps) => {
  const cards = [
    { label: "Total Sales", value: `$${formatCurrency(totalSales)}`, icon: DollarSign, color: "text-primary" },
    { label: "Total Guests", value: formatCurrency(totalGuests), icon: Users, color: "text-chart-3" },
    { label: "Total Orders", value: formatCurrency(totalOrders), icon: ShoppingCart, color: "text-chart-2" },
    { label: "Avg / Guest", value: `$${formatCurrency(avgPerGuest)}`, icon: TrendingUp, color: "text-primary" },
    { label: "Avg / Order", value: `$${formatCurrency(avgPerOrder)}`, icon: TrendingUp, color: "text-chart-4" },
    { label: "Total Discount", value: `$${formatCurrency(Math.abs(totalDiscount))}`, icon: DollarSign, color: "text-destructive" },
    { label: "Sales / Day", value: `$${formatCurrency(salesPerDay)}`, icon: DollarSign, color: "text-primary" },
    { label: "Guests / Day", value: formatCurrency(guestsPerDay), icon: Users, color: "text-chart-3" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="card-glass rounded-xl p-3 sm:p-4 animate-fade-in overflow-hidden">
          <div className="flex items-center gap-1.5 mb-2">
            <c.icon className={`h-4 w-4 shrink-0 ${c.color}`} />
            <span className="text-xs text-muted-foreground truncate">{c.label}</span>
          </div>
          <p className="text-base lg:text-lg xl:text-xl font-display font-bold text-foreground truncate">{c.value}</p>
        </div>
      ))}
    </div>
  );
};

export default KPICards;
