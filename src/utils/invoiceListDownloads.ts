import { parseAttachmentPaths } from "@/utils/invoiceAttachments";

interface DownloadInvoice {
  id: string;
  invoice_number: string;
  file_url: string | null;
  file_name: string | null;
}

/** Selection is scoped to the currently visible period and filters. */
export function invoiceDownloadFiles(invoices: DownloadInvoice[], selectedIds: ReadonlySet<string>) {
  const selected = invoices.filter(invoice => selectedIds.has(invoice.id));
  const targets = selected.length ? selected : invoices;
  return targets.flatMap(invoice => parseAttachmentPaths(invoice.file_url).map((path, index, paths) => ({
    path,
    name: paths.length === 1 && invoice.file_name
      ? invoice.file_name
      : `invoice-${invoice.invoice_number}-${index + 1}.${path.split(".").pop() || "pdf"}`,
  })));
}