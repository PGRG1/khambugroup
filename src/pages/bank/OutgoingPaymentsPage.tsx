import { CashFlowList } from "./IncomingDepositsPage";

export default function OutgoingPaymentsPage() {
  return (
    <CashFlowList
      mode="out"
      title="Outgoing Payments"
      description="Supplier payments, payroll, rent, utilities, taxes and other cash outflows."
      matchTargets={["Supplier invoice", "Expense bill", "Payroll", "Tax", "Other"]}
    />
  );
}
