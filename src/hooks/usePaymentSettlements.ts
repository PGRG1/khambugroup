import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";

export type PaymentProcessor = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  sort_order: number;
  notes: string;
};

export type ProcessorMerchant = {
  id: string;
  processor_id: string;
  merchant_number: string;
  display_name: string;
  venue: string | null;
  shared_venues: string[];
  default_bank_account_id: string | null;
  fee_account_id: string | null;
  store_address: string;
  is_active: boolean;
  sort_order: number;
  notes: string;
};

export type SettlementImport = {
  id: string;
  processor_id: string;
  period_start: string;
  period_end: string;
  currency: string;
  file_url: string | null;
  file_name: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  status: string;
  notes: string;
};

export type SettlementBatch = {
  id: string;
  import_id: string | null;
  processor_id: string;
  merchant_id: string;
  transaction_date: string;
  settlement_date: string;
  gross_amount: number;
  fee_amount: number;
  points_offset: number;
  bank_transfer_fee: number;
  adjustments: number;
  frozen_amount: number;
  net_settlement: number;
  bank_account_id: string | null;
  bank_transaction_id: string | null;
  status: string;
  notes: string;
};

export type SettlementLine = {
  id: string;
  batch_id: string;
  payment_type: string;
  payment_type_label: string;
  count: number;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
};

export function usePaymentSettlements() {
  const [loading, setLoading] = useState(true);
  const [processors, setProcessors] = useState<PaymentProcessor[]>([]);
  const [merchants, setMerchants] = useState<ProcessorMerchant[]>([]);
  const [imports, setImports] = useState<SettlementImport[]>([]);
  const [batches, setBatches] = useState<SettlementBatch[]>([]);
  const [lines, setLines] = useState<SettlementLine[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, m, i, b, l] = await Promise.all([
      fetchAllRows("payment_processors", "*", { col: "sort_order", asc: true }),
      fetchAllRows("payment_processor_merchants", "*", { col: "sort_order", asc: true }),
      fetchAllRows("payment_settlement_imports", "*", { col: "uploaded_at", asc: false }),
      fetchAllRows("payment_settlement_batches", "*", { col: "settlement_date", asc: false }),
      fetchAllRows("payment_settlement_lines", "*"),
    ]);
    setProcessors(p as PaymentProcessor[]);
    setMerchants(m as ProcessorMerchant[]);
    setImports(i as SettlementImport[]);
    setBatches(b as SettlementBatch[]);
    setLines(l as SettlementLine[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { loading, processors, merchants, imports, batches, lines, reload: load, supabase };
}
