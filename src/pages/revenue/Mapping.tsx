import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { RevenueMappingMatrix } from "@/components/finance/RevenueMappingMatrix";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function RevenueMapping() {
  const { items, loading } = useChartOfAccounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">Revenue Mapping</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How each sales field posts to the books — same data as Chart of Accounts → Account Mappings.
        </p>
      </div>

      {loading ? (
        <Card className="card-glass p-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      ) : (
        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Sales Revenue</TabsTrigger>
            <TabsTrigger value="payments">Payment Methods</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-4 space-y-6">
            <RevenueMappingMatrix accounts={items} section="sales" />
          </TabsContent>

          <TabsContent value="payments" className="mt-4 space-y-6">
            <RevenueMappingMatrix accounts={items} section="payments" />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
