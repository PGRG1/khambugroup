import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { ExpenseMappingMatrix } from "@/components/finance/ExpenseMappingMatrix";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExpenseMapping() {
  const { items, loading } = useChartOfAccounts();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">Expense Mapping</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Which GL account each expense category posts to — same data as Chart of Accounts →
          Account Mappings.
        </p>
      </div>

      {loading ? (
        <Card className="card-glass p-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      ) : (
        <ExpenseMappingMatrix accounts={items} />
      )}
    </div>
  );
}
