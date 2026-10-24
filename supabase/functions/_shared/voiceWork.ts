/** Select speech from confirmed tool execution, never from question keywords. */
export function confirmedWorkSpeech(tool: string): string {
  if (tool === "compare_periods") return "I'm comparing the revenue figures for those periods now.";
  if (tool === "get_supplier_price_trends") return "I'm checking those supplier prices now.";
  if (["get_sales_summary", "get_venue_performance", "get_forecast_vs_actual"].includes(tool)) return "I'm looking at your revenue figures now.";
  if (["get_invoice_summary", "get_top_suppliers", "get_invoice_line_items"].includes(tool)) return "I'm checking your supplier invoices now.";
  if (tool === "get_hr_summary") return "I'm checking payroll and revenue now.";
  if (tool === "get_inventory_status") return "I'm checking your stock records now.";
  if (tool === "get_cost_of_revenue") return "I'm checking purchases against revenue now.";
  if (tool === "get_menu_costing") return "I'm checking the recorded menu costs now.";
  if (tool === "get_pl_period") return "I'm checking your recorded financial figures now.";
  return "I'm checking the available records now.";
}