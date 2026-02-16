// Page definitions
export const ALL_PAGES = [
  { key: "revenue", label: "Revenue" },
  { key: "forecast", label: "Forecast vs Actual" },
  { key: "data", label: "Data" },
  { key: "activity-log", label: "Activity Log" },
  { key: "pl-report", label: "P&L Report" },
  { key: "invoices", label: "Invoices" },
  { key: "inventory", label: "Inventory" },
] as const;

export type PageKey = (typeof ALL_PAGES)[number]["key"];

// Per-page actions
export const PAGE_ACTIONS: Record<PageKey, { key: string; label: string }[]> = {
  revenue: [
    { key: "revenue.generate_report", label: "Generate Report (PDF)" },
    { key: "revenue.date_range", label: "Date Range Picker" },
    { key: "revenue.venue_filter", label: "Venue Filter" },
    { key: "revenue.view_toggle", label: "Daily / Monthly Toggle" },
  ],
  forecast: [
    { key: "forecast.new_entry", label: "New Forecast Entry" },
    { key: "forecast.view_data", label: "View Data Table" },
    { key: "forecast.edit_inputs", label: "Edit Forecast Inputs" },
    { key: "forecast.edit_notes", label: "Edit Forecast Notes" },
    { key: "forecast.edit_post_event", label: "Edit Post-Event Notes" },
    { key: "forecast.edit_comment", label: "Edit General Comment" },
    { key: "forecast.delete", label: "Delete Forecast" },
    { key: "forecast.date_range", label: "Date Range Picker" },
  ],
  data: [
    { key: "data.upload", label: "Upload Data" },
    { key: "data.scan_receipt", label: "Scan Receipt" },
    { key: "data.manual_entry", label: "Manual Entry" },
    { key: "data.edit_rows", label: "Edit Rows" },
    { key: "data.delete_rows", label: "Delete Rows" },
    { key: "data.reset", label: "Master Reset" },
  ],
  "activity-log": [],
  "pl-report": [
    { key: "pl-report.edit_values", label: "Edit P&L Values" },
    { key: "pl-report.add_line_item", label: "Add Line Item" },
  ],
  invoices: [
    { key: "invoices.create", label: "Create Invoice" },
    { key: "invoices.update_status", label: "Update Invoice Status" },
    { key: "invoices.add_supplier", label: "Add Supplier" },
    { key: "invoices.add_category", label: "Add Category" },
  ],
  inventory: [
    { key: "inventory.add_item", label: "Add Inventory Item" },
    { key: "inventory.new_period", label: "Create Period" },
    { key: "inventory.edit_counts", label: "Edit Counts" },
    { key: "inventory.close_period", label: "Close Period" },
  ],
};

export type Authority = "view_only" | "edit" | "admin";
export type UserPosition = "owner" | "gm" | "finance" | "staff" | "viewer";
export type UserStatus = "active" | "disabled";

export const POSITIONS: { value: UserPosition; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "gm", label: "GM" },
  { value: "finance", label: "Finance" },
  { value: "staff", label: "Staff" },
  { value: "viewer", label: "Viewer" },
];

export const AUTHORITIES: { value: Authority; label: string }[] = [
  { value: "view_only", label: "View Only" },
  { value: "edit", label: "Edit (Read/Write)" },
  { value: "admin", label: "Admin" },
];

export interface UserPagePermission {
  page_key: PageKey;
  show_in_sidebar: boolean;
  can_access: boolean;
  authority: Authority;
  hidden_actions: string[];
}

export interface UserAccessRecord {
  user_id: string;
  email: string;
  display_name: string | null;
  position: UserPosition;
  status: UserStatus;
  is_approver: boolean;
  pages: UserPagePermission[];
}
