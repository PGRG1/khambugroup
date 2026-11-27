import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import InvoiceScanner from "@/components/invoices/InvoiceScanner";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";
import { createScannerInvoiceRecord } from "@/hooks/useInvoiceData";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { INVOICE_BOOKED_EVENT, loadScannerProductMaster, saveScannerInvoice, type ScannerProductMasterEntry } from "@/utils/saveScannerInvoice";
import type { ScannerHandoff } from "@/utils/scannerHandoff";

/**
 * Bani chat host for one scanned invoice: the normal scanner (same parse, matching,
 * duplicate and blocking checks, same save + GRN), shown as a compact confirm card.
 * Everything is loaded for the active tenant only; the scanner rechecks identity
 * and edit access before reading the files.
 */
export function ChatInvoiceScan({ handoff, onOpenFull, onBooked, onStatus, onStop }: { handoff: ScannerHandoff; onOpenFull: () => void; onBooked: (text: string) => void; onStatus?: (title: string, status: string) => void; onStop?: () => void }) {
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<any[] | null>(null);
  const [productMaster, setProductMaster] = useState<ScannerProductMasterEntry[] | null>(null);
  const loadSuppliers = useCallback(async () => { if (tenantId) setSuppliers(await fetchAllRows("suppliers", "*", { col: "name", asc: true }, tenantId, true)); }, [tenantId]);
  const loadMaster = useCallback(async () => { if (tenantId) setProductMaster(await loadScannerProductMaster(tenantId)); }, [tenantId]);
  useEffect(() => { void loadSuppliers(); void loadMaster(); }, [loadSuppliers, loadMaster]);

  if (!suppliers || !productMaster || !user) return <p className="text-[13px] text-muted-foreground" role="status">Reading the invoice…</p>;
  return <InvoiceScanner
    variant="chat"
    handoff={handoff}
    suppliers={suppliers}
    productMaster={productMaster}
    onProductMasterChanged={loadMaster}
    onSuppliersChanged={loadSuppliers}
    userId={user.id}
    onClose={() => undefined}
    onOpenFull={onOpenFull}
    onChatStatus={onStatus}
    onStop={onStop}
    onSave={async (inv, lines, files, meta) => {
      const id = await saveScannerInvoice({ tenantId, userId: user.id, navigate, createRecord: (i, l, a) => createScannerInvoiceRecord(tenantId, i, l, a) }, inv, lines, files, meta);
      window.dispatchEvent(new CustomEvent(INVOICE_BOOKED_EVENT));
      onBooked(`Booked ${inv.invoice_number} · stock updated`);
      return id;
    }}
  />;
}
