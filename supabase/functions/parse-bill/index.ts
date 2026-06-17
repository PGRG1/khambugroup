import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an accurate bill/expense data extractor for a restaurant/bar group in Hong Kong (KHAMBU group — venues include Assembly, Caliente, Hanabi, Events).

You are extracting NON-INVENTORY bills (utilities, rent, telecom, internet, pest control, laundry, cleaning, repairs, licenses, insurance, professional fees, IT/software subscriptions, bank fees, service charges, fan rental, equipment rental, etc.) — NOT stock/ingredient purchases.

RULES:
- All extracted text MUST be in English. Translate any Chinese to English.
- Keep the vendor/company name EXACTLY as printed on the bill (you may include its English name if both are shown).
- Read every number digit by digit. Do not approximate.
- Dates in YYYY-MM-DD format.
- If a field is not visible/printed, return an empty string "" or 0 — never make up data.

IMPORTANT — ALLOCATION SPLITS:
- Most bills have one allocation row. But if the bill includes multiple distinct charges (e.g. service charge + late payment fee + base utility), split them into separate allocation rows.
- LATE PAYMENT INTEREST, PENALTIES, SURCHARGES, FINANCE CHARGES must be a SEPARATE allocation row with category "Late Payment Charges" — never roll them into the main expense.
- Each allocation row has: expense_category (short label), amount (number), notes (optional).
- The SUM of allocation amounts must equal the bill subtotal (total minus tax).

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
  "bill_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD or empty string",
  "service_period_start": "YYYY-MM-DD or empty string",
  "service_period_end": "YYYY-MM-DD or empty string",
  "venue": "Assembly, Caliente, Hanabi, Events, or empty string if not stated",
  "currency": "HKD by default unless other currency printed",
  "subtotal": number,
  "tax_amount": number,
  "total_amount": number,
  "suggested_document_type": "bill_expense | procurement_invoice | asset_purchase | payroll_document | bank_payment_document | manual_journal",
  "notes": "anything noteworthy in English",
  "allocations": [
    { "expense_category": "Utilities — Electricity", "amount": 10000, "notes": "" },
    { "expense_category": "Late Payment Charges", "amount": 300, "notes": "Late fee — paid past due date" }
  ]
}

If the document looks like an inventory/ingredient purchase (line items with SKUs/quantities of food/beverage/packaging), set suggested_document_type to "procurement_invoice" and still return your best-effort fields — the user will be redirected to the Procurement scanner.`;

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
        // PDF / other docs
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
      // Try to extract JSON block
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch (e) {
          console.warn("Failed to parse model response:", e);
        }
      }
    }

    // Normalise
    parsed.vendor_name = String(parsed.vendor_name || "").trim();
    parsed.bill_number = String(parsed.bill_number || "").trim();
    parsed.bill_date = String(parsed.bill_date || "").trim();
    parsed.due_date = String(parsed.due_date || "").trim();
    parsed.service_period_start = String(parsed.service_period_start || "").trim();
    parsed.service_period_end = String(parsed.service_period_end || "").trim();
    parsed.venue = String(parsed.venue || "").trim();
    parsed.currency = String(parsed.currency || "HKD").trim() || "HKD";
    parsed.subtotal = Number(parsed.subtotal || 0);
    parsed.tax_amount = Number(parsed.tax_amount || 0);
    parsed.total_amount = Number(parsed.total_amount || 0);
    parsed.notes = String(parsed.notes || "").trim();
    parsed.suggested_document_type = String(parsed.suggested_document_type || "bill_expense");
    parsed.allocations = Array.isArray(parsed.allocations) ? parsed.allocations : [];
    parsed.allocations = parsed.allocations.map((a: any) => ({
      expense_category: String(a.expense_category || "").trim(),
      amount: Number(a.amount || 0),
      notes: String(a.notes || "").trim(),
    }));

    // If subtotal/total missing, infer
    if (!parsed.subtotal && parsed.total_amount) parsed.subtotal = parsed.total_amount - parsed.tax_amount;
    if (!parsed.total_amount && parsed.subtotal) parsed.total_amount = parsed.subtotal + parsed.tax_amount;

    // If no allocations, create one default row from subtotal
    if (parsed.allocations.length === 0 && parsed.subtotal > 0) {
      parsed.allocations = [{ expense_category: "Other Operating Expenses", amount: parsed.subtotal, notes: "" }];
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
