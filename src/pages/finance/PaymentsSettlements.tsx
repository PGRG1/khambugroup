import { Card } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function PaymentsSettlements() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">Payments & Settlements</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Central hub for payment processor settlement statements.
        </p>
      </div>

      <Card className="card-glass p-10 flex flex-col items-center justify-center text-center gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <TrendingUp className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-medium">Coming soon</h2>
        <p className="text-sm text-muted-foreground max-w-xl">
          Settlement statements from your payment processors will appear here. Processors are
          configurable by an admin and may include providers such as KPay, Stripe, Adyen, PayMe,
          bank card processors, QR payment providers, or other local providers.
        </p>
      </Card>
    </div>
  );
}
