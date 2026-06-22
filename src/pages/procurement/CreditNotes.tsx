import { Card, CardContent } from "@/components/ui/card";

export default function CreditNotes() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <h1 className="text-2xl font-bold font-display">
        <span className="text-gradient-gold">Credit & Debit Notes</span>
      </h1>
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          This page is being built.
        </CardContent>
      </Card>
    </div>
  );
}
