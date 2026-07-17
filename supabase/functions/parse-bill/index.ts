import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an accurate bill/expense data extractor for a restaurant/bar group in Hong Kong (KHAMBU group — venues include Assembly, Caliente, Arca).

You are extracting NON-INVENTORY bills (utilities, rent, telecom, internet, pest control, laundry, cleaning, repairs, licenses, insurance, professional fees, IT/software subscriptions, bank fees, service charges, fan rental, equipment rental, etc.) — NOT stock/ingredient purchases.

RULES:
- All extracted text MUST be in English. Translate any Chinese to English.
- Keep the vendor/company name EXACTLY as printed on the bill (you may include its English name if both are shown).
- Read every number digit by digit. Do not approximate.
- Dates in YYYY-MM-DD format.
- If a field is not visible/printed, return an empty string "" or 0 — never make up data.

DATE RULES (CRITICAL — Hong Kong bills are day-first):
(a) Look for printed format hints like "(DD-MM-YY)" or "(DD/MM/YYYY)" next to a date label and obey them literally.
(b) Hong Kong bills default to DD-MM-YY or DD-MM-YYYY day-first order. NEVER assume YY-MM-DD. E.g. "24-06-26" printed under "(DD-MM-YY)" means 2026-06-24, NOT 2024-06-26.
(c) Two-digit years are 20YY (so "26" = 2026).
(d) Sanity check every date: bill_date should be within ~2 years of today; service_period_start/end should precede bill_date; due_date should follow bill_date. If a parsed date lands years in the past for a clearly recent bill, re-read the source assuming day-first order.

STATEMENT vs INVOICE (CRITICAL — do not double-count):
- If the bill shows "Brought Forward", "Previous Balance", "Balance B/F", "B/F", "Amount from previous bill", or similar prior-balance line, it is a STATEMENT, not a plain invoice.
- On a statement, the printed "Total Amount" = brought_forward + current_charges. Booking the printed total as an expense would double-count the brought-forward portion (already booked on the prior bill).
- Return these JSON fields:
    "brought_forward": number  // 0 if there is no B/F line
    "statement_total": number | null  // the printed Total Amount when it IS a statement; null otherwise
    "current_charges": number  // this period's charges only (energy/service + adjustments + late fees + odd cents)
- For statements: set "subtotal" and "total_amount" to CURRENT CHARGES ONLY, never the printed statement total. Allocations must sum to current_charges. Brought Forward MUST NEVER appear as an allocation row.
- Payments listed on the statement ("Thank you for your payment received on…") are NOT charges — do not allocate them; mention them in notes only.
- CLP worked example: printed Total 37,027 = Brought Forward 18,706 + current charges 18,321. Correct output: total_amount=18321, subtotal=18321, brought_forward=18706, statement_total=37027, allocations sum to 18321.

IMPORTANT — ALLOCATION SPLITS:
- Most bills have one allocation row. If the bill has multiple distinct charges (e.g. service charge + late payment fee + base utility), split them into separate allocation rows.
- LATE PAYMENT INTEREST, PENALTIES, SURCHARGES, FINANCE CHARGES must be a SEPARATE allocation row with category "Late Payment Charges" — never rolled into the main expense.
- Each allocation row has: expense_category (short label), amount (number), notes (optional).
- The SUM of allocation amounts must equal the bill subtotal (i.e. current_charges for statements, or total minus tax for plain invoices).

BILL NUMBER vs ACCOUNT NUMBER:
- "bill_number" is a document-specific invoice/bill number, unique to this one document.
- Account numbers, customer numbers, meter numbers, contract numbers, and reference numbers that persist across bills are NOT bill numbers.
- If no true bill number is printed, return "" for bill_number.
- Return the account/customer number separately as "account_number" ("" if none).

CONSUMPTION (utility bills only):
- For electricity/water/gas bills, capture "consumption" as:
    { "meter_no": string, "prev_reading": number, "present_reading": number, "units": number, "unit_rate_cents": number, "days": number }
- Set "consumption" to null for non-utility bills.

Suggested expense_category values to use when applicable:
- Utilities — Electricity / Water / Gas
- Telecom & Internet
- Rent
- Pest Control
- Laundry / Linen
- Cleaning Services
- Repairs & Maintenance
- Licenses & Permits
- Insurance
- Professional Fees (Legal / Accounting / Consulting)
- IT & Software Subscriptions
- Bank Fees
- Equipment Rental
- Late Payment Charges
- Other Operating Expenses

Return ONLY valid JSON with this exact structure:

{
  "vendor_name": "exact name as printed",
  "bill_number": "invoice/bill/reference number, or empty string",
  "account_number": "customer/account/meter number, or empty string",
  "bill_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD or empty string",
  "service_period_start": "YYYY-MM-DD or empty string",
  "service_period_end": "YYYY-MM-DD or empty string",
  "venue": "Assembly, Caliente, Arca, or empty string if not stated",
  "currency": "HKD by default unless other currency printed",
  "subtotal": number,
  "tax_amount": number,
  "total_amount": number,
  "brought_forward": number,
  "statement_total": number_or_null,
  "current_charges": number,
  "consumption": null_or_object,
  "suggested_document_type": "bill_expense | procurement_invoice | asset_purchase | payroll_document | bank_payment_document | manual_journal",
  "notes": "anything noteworthy in English",
  "allocations": [
    { "expense_category": "Utilities — Electricity", "amount": 10000, "notes": "" },
    { "expense_category": "Late Payment Charges", "amount": 300, "notes": "Late fee — paid past due date" }
  ]
}

If the document looks like an inventory/ingredient purchase (line items with SKUs/quantities of food/beverage/packaging), set suggested_document_type to "procurement_invoice" and still return your best-effort fields — the user will be redirected to the Procurement scanner.`;

// --- Date helpers -----------------------------------------------------------

function parseIsoDate(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return null;
  return d;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Given a YYYY-MM-DD string the model may have parsed as YY-MM-DD (i.e. century
// error), attempt a swap treating original as DD-MM-YY: (yy=DD, mm=MM, dd=YY).
function swapDayFirst(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  // Interpret last two digits of yyyy as DD, and dd as YY -> 20YY
  const origYYlast = yyyy % 100;
  const newDay = origYYlast; // was mis-read as year tail
  const newYear = 2000 + dd; // was mis-read as day
  if (newDay < 1 || newDay > 31) return null;
  const d = new Date(newYear, mm - 1, newDay);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() !== newYear || d.getMonth() !== mm - 1 || d.getDate() !== newDay) return null;
  return toIsoDate(d);
}

function monthsBetween(a: Date, b: Date): number {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireAuth(req, corsHeaders);
  if (auth.response) return auth.response;

  try {
    const { fileBase64, mimeType, files } = await req.json();

    let fileEntries: { base64: string; mimeType: string }[] = [];
    if (files && Array.isArray(files) && files.length > 0) {
      fileEntries = files;
    } else if (fileBase64) {
      fileEntries = [{ base64: fileBase64, mimeType: mimeType || "application/pdf" }];
    }
    if (fileEntries.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No file data provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent: any[] = [
      { type: "text", text: "Extract the bill data from the attached file(s) and return only the JSON object specified." },
    ];
    for (const f of fileEntries) {
      const dataUrl = `data:${f.mimeType};base64,${f.base64}`;
      if (f.mimeType.startsWith("image/")) {
        userContent.push({ type: "image_url", image_url: { url: dataUrl } });
      } else {
        userContent.push({
          type: "file",
          file: { filename: "bill", file_data: dataUrl },
        });
      }
    }

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    };

    const t0 = Date.now();
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log(`parse-bill: gateway responded in ${Date.now() - t0}ms, status ${resp.status}`);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Gateway error:", resp.status, errText);
      const status = resp.status === 429 ? 429 : resp.status === 402 ? 402 : 500;
      return new Response(
        JSON.stringify({ success: false, error: status === 429 ? "Rate limit — please retry shortly." : status === 402 ? "AI credits depleted." : "AI extraction failed" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "";
    let parsed: any = {};
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch (e) {
          console.warn("Failed to parse model response:", e);
        }
      }
    }

    // Normalise strings/numbers
    parsed.vendor_name = String(parsed.vendor_name || "").trim();
    parsed.bill_number = String(parsed.bill_number || "").trim();
    parsed.account_number = String(parsed.account_number || "").trim();
    parsed.bill_date = String(parsed.bill_date || "").trim();
    parsed.due_date = String(parsed.due_date || "").trim();
    parsed.service_period_start = String(parsed.service_period_start || "").trim();
    parsed.service_period_end = String(parsed.service_period_end || "").trim();
    parsed.venue = String(parsed.venue || "").trim();
    parsed.currency = String(parsed.currency || "HKD").trim() || "HKD";
    parsed.subtotal = Number(parsed.subtotal || 0);
    parsed.tax_amount = Number(parsed.tax_amount || 0);
    parsed.total_amount = Number(parsed.total_amount || 0);
    parsed.brought_forward = Number(parsed.brought_forward || 0);
    parsed.statement_total =
      parsed.statement_total === null || parsed.statement_total === undefined || parsed.statement_total === ""
        ? null
        : Number(parsed.statement_total);
    parsed.current_charges = Number(parsed.current_charges || 0);
    parsed.consumption =
      parsed.consumption && typeof parsed.consumption === "object" ? parsed.consumption : null;
    parsed.notes = String(parsed.notes || "").trim();
    parsed.suggested_document_type = String(parsed.suggested_document_type || "bill_expense");
    parsed.allocations = Array.isArray(parsed.allocations) ? parsed.allocations : [];
    parsed.allocations = parsed.allocations.map((a: any) => ({
      expense_category: String(a.expense_category || "").trim(),
      amount: Number(a.amount || 0),
      notes: String(a.notes || "").trim(),
    }));

    // --- Date sanity guard: if bill_date is >18 months in the past AND a
    // day-first swap yields a date within 6 months of today, apply the swap
    // to all four date fields.
    const today = new Date();
    const bd = parseIsoDate(parsed.bill_date);
    if (bd) {
      const monthsPast = monthsBetween(today, bd);
      if (monthsPast > 18) {
        const swappedIso = swapDayFirst(parsed.bill_date);
        const swapped = swappedIso ? parseIsoDate(swappedIso) : null;
        if (swapped) {
          const swappedMonthsFromToday = Math.abs(monthsBetween(today, swapped));
          if (swappedMonthsFromToday <= 6) {
            const applySwap = (iso: string) => {
              if (!iso) return iso;
              const s = swapDayFirst(iso);
              return s || iso;
            };
            parsed.bill_date = applySwap(parsed.bill_date);
            parsed.due_date = applySwap(parsed.due_date);
            parsed.service_period_start = applySwap(parsed.service_period_start);
            parsed.service_period_end = applySwap(parsed.service_period_end);
            const note = "Dates reinterpreted as DD-MM-YY (Hong Kong day-first).";
            parsed.notes = parsed.notes ? `${parsed.notes} ${note}` : note;
          }
        }
      }
    }

    // If subtotal/total missing, infer
    if (!parsed.subtotal && parsed.total_amount) parsed.subtotal = parsed.total_amount - parsed.tax_amount;
    if (!parsed.total_amount && parsed.subtotal) parsed.total_amount = parsed.subtotal + parsed.tax_amount;

    // Statement safety net: if brought_forward > 0 and current_charges is set,
    // force subtotal/total_amount to current_charges (never the statement total).
    if (parsed.brought_forward > 0 && parsed.current_charges > 0) {
      parsed.total_amount = parsed.current_charges;
      parsed.subtotal = parsed.current_charges - (parsed.tax_amount || 0);
      // If allocations still sum to statement_total, drop any row that matches brought_forward
      const allocSum = parsed.allocations.reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
      if (Math.abs(allocSum - parsed.current_charges) > 0.5) {
        parsed.allocations = parsed.allocations.filter(
          (a: any) => Math.abs(Number(a.amount || 0) - parsed.brought_forward) > 0.5
        );
      }
    }

    // If no allocations, create one default row from subtotal
    if (parsed.allocations.length === 0 && parsed.subtotal > 0) {
      parsed.allocations = [{ expense_category: "Other Operating Expenses", amount: parsed.subtotal, notes: "" }];
    }

    // Bill number synthesis: if empty OR equals the account number, build a
    // stable synthetic reference so downstream matching still works.
    const looksLikeAccountRef = (s: string) =>
      !!s && !!parsed.account_number && s.replace(/\s+/g, "").toLowerCase() === parsed.account_number.replace(/\s+/g, "").toLowerCase();
    if (!parsed.bill_number || looksLikeAccountRef(parsed.bill_number)) {
      const period = parsed.service_period_end || parsed.bill_date || "";
      const ym = period ? period.slice(0, 7) : "";
      const initials =
        (parsed.vendor_name || "")
          .split(/\s+/)
          .filter(Boolean)
          .map((w: string) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 4) || "BILL";
      const stem = parsed.account_number || initials;
      parsed.bill_number = ym ? `${stem}/${ym}` : stem;
    }

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("parse-bill error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
