import { useQuery } from "@tanstack/react-query";
import { fetchAllRows, fetchAllRowsParallel } from "@/utils/fetchAllRows";
import type { OverviewInvoice, OverviewLine, OverviewProduct, OverviewSale } from "@/utils/purchasingOverview";

/** Invoices, lines, products, suppliers and sales for Purchasing Overview and Trends (one shared cache). */
export function usePurchasingData(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["proc-dash", "overview-redesign", tenantId], enabled: !!tenantId, staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const id = tenantId as string;
      const [invoices, suppliers, sales, lines, products, categoryRows] = await Promise.all([
        fetchAllRowsParallel("invoices", "id,supplier_id,invoice_date,total_amount,discount,venue,created_at,review_status,has_disputes", id, { col: "invoice_date", asc: false }),
        fetchAllRows("suppliers", "id,name", undefined, id),
        fetchAllRowsParallel("sales_records", "id,date,total_sales,venue", id),
        fetchAllRowsParallel("invoice_line_items", "id,invoice_id,product_master_id,total,unit_price,unit,quantity", id),
        fetchAllRows("product_master", "id,internal_product_name,financial_treatment,level1_category,level2_category,unit", undefined, id),
        fetchAllRows("product_categories", "name,level,is_active", undefined, id),
      ]);
      return { invoices: invoices as OverviewInvoice[], suppliers: suppliers as { id: string; name: string }[], sales: sales as OverviewSale[], lines: lines as OverviewLine[], products: products as OverviewProduct[], categoryRows: categoryRows as { name: string; level: number; is_active: boolean }[] };
    },
  });
}
