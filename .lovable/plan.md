# Finance: Document Centre & Documents & Bills

## Overview

Add two new Finance pages and reorder the Finance sidebar. Document Centre becomes the central scanning/upload hub that routes to the correct existing workflow. Documents & Bills becomes the Finance-owned view of invoices/bills (reusing existing invoice data).

## Sidebar (src/components/AppSidebar.tsx)

New top-level Finance order:

1. Dashboard → `/finance/dashboard`
2. Document Centre → `/finance/document-centre` (new)
3. Documents & Bills → `/finance/documents-bills` (new)
4. Accounts Payable → `/finance/payables`
5. Accounts Receivable → `/finance/receivables`
6. Payments & Settlements → `/finance/payments-settlements` (placeholder)
7. Bank Reconciliation → `/finance/bank-reconciliation`

Reports and Accounting collapsibles remain unchanged below.

Icons: `FolderOpen` for Document Centre, `FileText` for Documents & Bills.

## New page: Document Centre (`src/pages/finance/DocumentCentre.tsx`)

**Header**: Page title + a primary "Scan / Upload Document" button.

**Document type picker** (Dialog opened by the button) — 8 cards/tiles in a grid:

| Type | Action |
|---|---|
| Daily Sales / EOD Report | Opens existing `<ReceiptScanner>` (same one used in dashboard). On save, calls existing sales insert flow. |
| Invoice / Bill | Opens existing `<InvoiceScanner>` modal (same component used in `/invoices`). |
| Payment Processor / Settlement Statement | Navigates to `/finance/payments-settlements` (placeholder page) |
| Bank Statement | Placeholder toast "Coming soon" |
| Contract / Agreement | Placeholder toast |
| Payroll File | Placeholder toast |
| Petty Cash Receipt | Placeholder toast |
| Other | Placeholder toast |

**Document list table** below: pulls from `invoices` table for now (file_name, supplier name as source, invoice number as linked record, status, created_at). Columns: File name, Document type, Source workflow, Linked record, Status, Uploaded date, Actions (View → opens attachment via existing `AttachmentViewerDialog`). This table is read-only and unifies what we already have; future doc types extend it.

Technical detail: reuse `useInvoiceData` and existing scanner components — no new tables required in this step.

## New page: Documents & Bills (`src/pages/finance/DocumentsBills.tsx`)

Finance-owned, lighter-weight invoice/bill list. Reuses `useInvoiceData` (invoices, suppliers) and existing `AttachmentViewerDialog`.

Columns:
- Vendor / Counterparty (supplier name)
- Invoice number
- Invoice date
- Due date
- Amount (total_amount)
- Status (status badge — same color map as `/invoices`)
- Linked source document (file_name link → AttachmentViewerDialog)
- Actions: "View details" → opens a Sheet showing invoice header + line items via `fetchLineItems(invoice.id)` rendered in a simple read-only table (description, qty, unit, unit_price, discount, tax, total).

Filters on top: search (vendor/invoice#), status select, date range. CSV export using existing `csvDownload` util (UTF-8 BOM).

The full edit/scan workflow stays at `/invoices` (Procurement). Documents & Bills is a Finance read/review surface.

## New placeholder page: Payments & Settlements (`src/pages/finance/PaymentsSettlements.tsx`)

Simple page with `<PageHeader>` and an empty-state card: "Payment processor settlements will appear here. Processors are configurable by admin." No hardcoded provider names. Lists examples in body text (KPay, Stripe, Adyen, PayMe, etc.).

## Routes (src/App.tsx)

Add three admin-protected routes:
- `/finance/document-centre` → `DocumentCentre`
- `/finance/documents-bills` → `DocumentsBills`
- `/finance/payments-settlements` → `PaymentsSettlements`

## Out of scope (future)

- Dedicated `documents` table unifying all doc types
- Bank statement / contract / payroll / petty cash parsers
- Admin UI for configuring payment processors
- RLS / new schema (none needed now)

## Files

**New**
- `src/pages/finance/DocumentCentre.tsx`
- `src/pages/finance/DocumentsBills.tsx`
- `src/pages/finance/PaymentsSettlements.tsx`

**Modified**
- `src/components/AppSidebar.tsx` — reorder + add 2 items
- `src/App.tsx` — add 3 routes