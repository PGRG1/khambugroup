// Page definitions — top-level sections mirroring the sidebar layout.
export const ALL_PAGES = [
  { key: "revenue",     label: "Revenue" },
  { key: "kpis",        label: "KPI Management" },
  { key: "finance",     label: "Finance" },
  { key: "procurement", label: "Procurement" },
  { key: "expenses",    label: "Expenses" },
  { key: "payments",    label: "Payments & Settlements" },
  { key: "bank",        label: "Bank" },
  { key: "pettycash",   label: "Petty Cash" },
  { key: "people",      label: "People & HR" },
  { key: "admin",       label: "Admin" },
] as const;

export type PageKey = (typeof ALL_PAGES)[number]["key"];

// Per-page actions surfaced in the User Editor as "hide-able" toggles.
export const PAGE_ACTIONS: Record<PageKey, { key: string; label: string }[]> = {
  revenue: [
    { key: "revenue.generate_report", label: "Generate Report (PDF)" },
    { key: "revenue.date_range", label: "Date Range Picker" },
    { key: "revenue.venue_filter", label: "Venue Filter" },
    { key: "revenue.view_toggle", label: "Daily / Monthly Toggle" },
  ],
  kpis: [
    { key: "kpis.update_actual", label: "Update Actual Value" },
    { key: "kpis.create_card", label: "Create KPI Card" },
    { key: "kpis.assign", label: "Assign KPI Card" },
    { key: "kpis.set_target", label: "Set / Edit Targets" },
  ],
  finance: [
    { key: "finance.post_journal", label: "Post journal entries" },
    { key: "finance.export", label: "Export reports" },
  ],
  procurement: [
    { key: "procurement.approve_invoice", label: "Approve invoices" },
    { key: "procurement.delete_invoice", label: "Delete invoices" },
    { key: "procurement.manage_suppliers", label: "Manage suppliers" },
  ],
  expenses: [
    { key: "expenses.approve_bill", label: "Approve bills" },
    { key: "expenses.delete_bill", label: "Delete bills" },
  ],
  payments: [
    { key: "payments.import", label: "Import statements" },
    { key: "payments.match", label: "Match to bank" },
  ],
  bank: [
    { key: "bank.reconcile", label: "Reconcile periods" },
    { key: "bank.close_period", label: "Close reconciliation period" },
  ],
  pettycash: [
    { key: "pettycash.approve", label: "Approve receipts" },
    { key: "pettycash.post", label: "Post to GL" },
    { key: "pettycash.replenish", label: "Record replenishments" },
  ],
  people: [
    { key: "people.manage_payroll", label: "Manage payroll" },
    { key: "people.view_salary", label: "View salary information" },
  ],
  admin: [],
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
  venue_ids: string[];
}
