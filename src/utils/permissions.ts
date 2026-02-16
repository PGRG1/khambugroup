// Page definitions
export const ALL_PAGES = [
  { key: "revenue", label: "Revenue" },
  { key: "forecast", label: "Forecast vs Actual" },
  { key: "data", label: "Data" },
  { key: "activity-log", label: "Activity Log" },
  { key: "pl-report", label: "P&L Report" },
] as const;

export type PageKey = (typeof ALL_PAGES)[number]["key"];

// Per-page actions
export const PAGE_ACTIONS: Record<PageKey, { key: string; label: string }[]> = {
  revenue: [
    { key: "revenue.export_pdf", label: "Download / Export PDF" },
    { key: "revenue.export_csv", label: "Export CSV" },
    { key: "revenue.sort", label: "Sort" },
    { key: "revenue.filters", label: "Filters" },
    { key: "revenue.date_range", label: "Date Range Picker" },
    { key: "revenue.view_table", label: "View Table Details" },
    { key: "revenue.edit_notes", label: "Edit Notes" },
  ],
  forecast: [
    { key: "forecast.export_pdf", label: "Download / Export PDF" },
    { key: "forecast.export_csv", label: "Export CSV" },
    { key: "forecast.sort", label: "Sort" },
    { key: "forecast.filters", label: "Filters" },
    { key: "forecast.edit_inputs", label: "Edit Forecast Inputs" },
    { key: "forecast.edit_notes", label: "Edit Forecast Notes" },
    { key: "forecast.edit_post_event", label: "Edit Post-Event Notes" },
  ],
  data: [
    { key: "data.upload", label: "Upload Data" },
    { key: "data.edit_rows", label: "Edit Rows" },
    { key: "data.delete_rows", label: "Delete Rows" },
    { key: "data.export_csv", label: "Export CSV" },
    { key: "data.download", label: "Download" },
  ],
  "activity-log": [
    { key: "activity-log.export", label: "Export" },
    { key: "activity-log.filter", label: "Filter" },
  ],
  "pl-report": [
    { key: "pl-report.export_pdf", label: "Export PDF" },
    { key: "pl-report.export_csv", label: "Export CSV" },
    { key: "pl-report.drilldown", label: "Drilldown / Details" },
    { key: "pl-report.filters", label: "Filters" },
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
