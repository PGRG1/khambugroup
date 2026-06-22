import React from "react";
import InventoryOnHandTab from "./InventoryOnHandTab";

/**
 * Deposit Ledger — balance-sheet items (e.g. Supplier Deposits, Fixed Assets,
 * Prepayments) accumulated from GRN accepted quantities. Mirrors the Stock on
 * Hand view but filters product_master to `financial_treatment` starting with
 * "Asset". COGS/OpEx items remain on Stock on Hand.
 */
export default function DepositLedgerTab() {
  return <InventoryOnHandTab mode="deposits" />;
}
