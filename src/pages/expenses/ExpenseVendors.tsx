import VendorDirectory from "@/components/vendors/VendorDirectory";

export default function ExpenseVendorsPage() {
  return (
    <div className="p-6">
      <VendorDirectory defaultTypeFilter="expense" />
    </div>
  );
}
