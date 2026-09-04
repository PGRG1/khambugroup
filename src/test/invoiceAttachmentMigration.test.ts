import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static migration guard. These assertions would have failed on the release
 * that shipped `link_invoice_attachments` client calls without the table or
 * the function existing in any committed migration.
 */
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n");

/** Body of a committed function, used to prove single-transaction behaviour. */
function functionBody(name: string): string {
  const start = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} is not defined in any committed migration`).toBeGreaterThan(-1);
  const ends = ["\n$$;", "\n$function$;"]
    .map((marker) => sql.indexOf(marker, start))
    .filter((idx) => idx > start);
  expect(ends.length).toBeGreaterThan(0);
  return sql.slice(start, Math.min(...ends));
}

function lineItemInsertColumns(body: string): string[] {
  const match = body.match(/INSERT INTO public\.invoice_line_items\s*\(([^)]+)\)/is);
  expect(match, "scanner RPC must use an explicit invoice_line_items column list").not.toBeNull();
  return (match?.[1] ?? "").split(",").map((column) => column.trim());
}

// Snapshot from information_schema.columns for public.invoice_line_items:
// NOT NULL columns with no default that the application must supply.
const LINE_ITEM_REQUIRED_NO_DEFAULT_COLUMNS = ["invoice_id", "description"] as const;
// NOT NULL columns that have a DB default — they must be either omitted or
// supplied with a non-null value, never forced to NULL by a rowtype insert.
const LINE_ITEM_REQUIRED_WITH_DEFAULT_COLUMNS = [
  "id", "quantity", "unit_price", "tax_amount", "total", "created_at", "discount",
  "tenant_id", "discount_mode", "discount_rate", "line_discount_amount",
  "header_discount_share", "net_unit_cost", "price_disputed", "is_free_unit_line",
] as const;

function invoiceInsertColumns(body: string): string[] {
  const match = body.match(/INSERT INTO public\.invoices\s*\(([^)]+)\)\s*VALUES/is);
  expect(match, "scanner RPC must use an explicit invoices column list").not.toBeNull();
  return (match?.[1] ?? "").split(",").map((column) => column.trim());
}

// Snapshot from information_schema.columns for public.invoices. These are the
// application-supplied NOT NULL columns with neither a default nor generation.
const INVOICE_REQUIRED_NO_DEFAULT_COLUMNS = [
  "supplier_id",
  "venue",
  "invoice_number",
  "invoice_date",
  "entered_by",
] as const;

describe("committed invoice attachment migrations", () => {
  it("creates the invoice_attachments table with tenant, invoice and metadata columns", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.invoice_attachments");
    for (const col of [
      "tenant_id uuid NOT NULL",
      "invoice_id uuid NOT NULL",
      "bucket text NOT NULL",
      "path text NOT NULL",
      "original_name text NOT NULL",
      "mime_type text NOT NULL",
      "size_bytes bigint NOT NULL",
      "checksum text",
      "sort_order integer NOT NULL",
      "attached_by uuid",
      "attached_at timestamptz NOT NULL",
    ]) {
      expect(sql).toContain(col);
    }
  });

  it("cascades from the invoice and indexes tenant/invoice/path and order", () => {
    expect(sql).toContain("REFERENCES public.invoices(id) ON DELETE CASCADE");
    expect(sql).toContain("invoice_attachments_tenant_unique_path");
    expect(sql).toContain("ON public.invoice_attachments (tenant_id, invoice_id, sort_order)");
  });

  it("locks the table down with tenant-membership RLS and authenticated grants", () => {
    expect(sql).toContain("ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain('CREATE POLICY "Tenant members manage invoice attachments"');
    expect(sql).toMatch(/USING \(public\.user_has_tenant\(auth\.uid\(\), tenant_id\)\)/);
    expect(sql).toMatch(/WITH CHECK \(public\.user_has_tenant\(auth\.uid\(\), tenant_id\)\)/);
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_attachments TO authenticated");
  });

  it("defines link_invoice_attachments as a locked-down security definer RPC", () => {
    const body = functionBody("link_invoice_attachments");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.link_invoice_attachments(uuid, uuid, jsonb, text) TO authenticated",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.link_invoice_attachments(uuid, uuid, jsonb, text) FROM PUBLIC",
    );
  });

  it("requires auth, tenant membership and a valid reason before linking", () => {
    const body = functionBody("link_invoice_attachments");
    expect(body).toContain("v_uid uuid := auth.uid()");
    expect(body).toContain("Authentication required.");
    expect(body).toContain("public.user_has_tenant(v_uid, p_tenant_id)");
    expect(body).toContain("NOT IN ('scanner', 'repair')");
  });

  it("scopes the invoice lookup to the tenant and rejects cross-tenant paths", () => {
    const body = functionBody("link_invoice_attachments");
    expect(body).toMatch(/WHERE id = p_invoice_id AND tenant_id = p_tenant_id\s+FOR UPDATE/);
    expect(body).toContain("NOT LIKE (p_tenant_id::text || '/%')");
    expect(body).toContain("outside this tenant folder");
  });

  it("writes metadata, the legacy file columns and the audit row in one function body", () => {
    const body = functionBody("link_invoice_attachments");
    expect(body).toContain("INSERT INTO public.invoice_attachments");
    expect(body).toContain("UPDATE public.invoices");
    expect(body).toContain("SET file_url = v_file_url");
    expect(body).toContain("INSERT INTO public.audit_log");
    expect(body).toContain("'attachment_repair'");
    // identity is taken server-side, never from the client payload
    expect(body).not.toContain("p_attached_by");
  });

  it("never touches invoice business fields during a repair", () => {
    const body = functionBody("link_invoice_attachments");
    const update = body.slice(body.indexOf("UPDATE public.invoices"));
    for (const field of ["total_amount", "subtotal", "status", "tax_amount", "invoice_number", "supplier_id"]) {
      expect(update.slice(0, update.indexOf("INSERT INTO public.audit_log"))).not.toContain(field);
    }
  });

  it("creates scanner invoices, lines, attachments and audit atomically", () => {
    const body = functionBody("create_scanner_invoice_with_attachments");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("public.user_has_tenant(v_uid, p_tenant_id)");
    expect(body).toContain("requires at least one durable source attachment");
    expect(body).toContain("NOT LIKE (p_tenant_id::text || '/%')");
    expect(body).toContain("INSERT INTO public.invoices");
    expect(body).toContain("INSERT INTO public.invoice_line_items");
    expect(body).toContain("INSERT INTO public.invoice_attachments");
    expect(body).toContain("INSERT INTO public.audit_log");
  });

  it("enforces linked metadata when a scanner invoice is updated or approved", () => {
    const body = functionBody("enforce_scanner_invoice_attachment");
    expect(body).toContain("TG_OP = 'UPDATE'");
    expect(body).toContain("FROM public.invoice_attachments ia");
    expect(body).toContain("ia.invoice_id = NEW.id AND ia.tenant_id = NEW.tenant_id");
    expect(body).toContain("durable source attachment");
    // legacy/manual invoices are untouched
    expect(sql).not.toMatch(/ALTER TABLE public\.invoices[^;]*ALTER COLUMN file_url SET NOT NULL/);
  });

  it("keeps an audit view that detects a missing file or missing metadata", () => {
    expect(sql).toContain("CREATE VIEW public.v_invoices_missing_attachment");
    expect(sql).toContain("missing_metadata");
    expect(sql).toContain("i.source_origin = 'scanner' AND NOT EXISTS");
  });

  it("restricts invoice-file storage to the caller's own tenant folder", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.invoice_storage_path_allowed(p_name text)");
    expect(sql).toContain("public.user_has_tenant(auth.uid(), v_tenant)");
    for (const cmd of ["FOR SELECT", "FOR INSERT", "FOR UPDATE", "FOR DELETE"]) {
      expect(sql).toContain(`ON storage.objects ${cmd} TO authenticated`);
    }
    expect(sql).toContain("public.invoice_storage_path_allowed(name)");
  });

  it("covers every invoices NOT NULL/no-default column without a rowtype insert", () => {
    const body = functionBody("create_scanner_invoice_with_attachments");
    const insertColumns = invoiceInsertColumns(body);

    expect(insertColumns).toEqual(expect.arrayContaining([...INVOICE_REQUIRED_NO_DEFAULT_COLUMNS]));
    expect(body).not.toContain("INSERT INTO public.invoices SELECT v_invoice.*");
    expect(body).not.toContain("jsonb_populate_record(NULL::public.invoices");
    expect(body).toContain("COALESCE(NULLIF(p_invoice->>'payment_status', ''), 'unpaid')");
    expect(body).toContain("v_uid");
    // the attachment transaction logic is preserved in the same body
    expect(body).toContain("INSERT INTO public.invoice_line_items");
    expect(body).toContain("INSERT INTO public.invoice_attachments");
    expect(body).toContain("INSERT INTO public.audit_log");
    expect(body).toContain("NOT LIKE (p_tenant_id::text || '/%')");
  });

  it("inserts invoice line items by explicit column, never as a rowtype", () => {
    const body = functionBody("create_scanner_invoice_with_attachments");
    const columns = lineItemInsertColumns(body);

    expect(columns).toEqual(expect.arrayContaining([...LINE_ITEM_REQUIRED_NO_DEFAULT_COLUMNS]));
    // Defaulted required columns must be left to the database.
    for (const column of LINE_ITEM_REQUIRED_WITH_DEFAULT_COLUMNS) {
      if (column === "id" || column === "created_at") expect(columns).not.toContain(column);
    }
    // Any defaulted column we do list must be COALESCEd to a non-null value.
    for (const column of ["quantity", "unit_price", "tax_amount", "total", "discount", "discount_mode", "discount_rate", "line_discount_amount", "header_discount_share", "net_unit_cost", "price_disputed", "is_free_unit_line"]) {
      if (columns.includes(column)) {
        expect(body).toMatch(new RegExp(`COALESCE\\(\\(?x->>'${column}'`));
      }
    }
    expect(body).not.toMatch(/INSERT INTO public\.invoice_line_items\s*\n?\s*SELECT \(r\)\.\*/i);
    expect(body).not.toContain("jsonb_populate_record(NULL::public.invoice_line_items");
    expect(body).not.toContain("jsonb_populate_record(NULL::public.invoices");
    // realistic multi-line invoice fields (VegFresh-style produce lines)
    for (const column of ["item_code", "unit", "weight", "pack_size", "accepted_qty", "qty_difference", "receiving_reason", "product_master_id"]) {
      expect(columns).toContain(column);
    }
  });

  it("stays idempotent so it can be replayed on a fresh database", () => {
    const attachmentMigration = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8").includes("CREATE TABLE IF NOT EXISTS public.invoice_attachments"))
      .at(-1)!;
    const body = readFileSync(join(MIGRATIONS_DIR, attachmentMigration), "utf8");
    expect(body).toContain("CREATE TABLE IF NOT EXISTS");
    expect(body).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(body).toMatch(/DROP POLICY IF EXISTS/);
    expect(body).toMatch(/DROP TRIGGER IF EXISTS/);
  });
});
