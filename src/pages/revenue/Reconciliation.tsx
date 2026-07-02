import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Reconciliation() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Revenue Reconciliation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare reported revenue with the customer payment methods recorded for each business date and venue.
          </p>
        </div>
      </div>

      <div className="card-glass rounded-xl p-8 text-center">
        <Scale className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <p className="text-sm text-muted-foreground mb-4">
          Revenue reconciliation has not been configured yet.
        </p>
        <Button disabled size="sm">
          Set Up Reconciliation
        </Button>
      </div>
    </div>
  );
}
