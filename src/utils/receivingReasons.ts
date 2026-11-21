/** Why a received quantity differs from the invoice. Shared by Scan Invoice and the Bani chat card. */
export const RECEIVING_REASONS: { value: string; label: string }[] = [
  { value: "short_delivery", label: "Short delivery" },
  { value: "partial_delivery", label: "Partial delivery" },
  { value: "not_received", label: "Not received" },
  { value: "damaged", label: "Damaged" },
  { value: "broken", label: "Broken" },
  { value: "poor_quality", label: "Poor quality" },
  { value: "rejected", label: "Rejected" },
  { value: "extra_quantity_received", label: "Extra quantity received" },
  { value: "free_promotional_quantity", label: "Free promotional quantity" },
  { value: "supplier_over_delivery", label: "Supplier over-delivery" },
  { value: "substitution_accepted", label: "Substitution accepted" },
  { value: "wrong_item_received", label: "Wrong item received" },
  { value: "new_item_received", label: "New item received" },
  { value: "other", label: "Other" },
];
