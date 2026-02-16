const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64) {
      return new Response(
        JSON.stringify({ success: false, error: "No file data provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an invoice data extractor for a restaurant/bar business (Assembly and Caliente venues in Hong Kong). A single document may contain MULTIPLE invoices (different dates, different invoice numbers, possibly from the same or different suppliers). You must extract ALL invoices found in the document.

IMPORTANT: ALL output text MUST be in English EXCEPT supplier names — keep supplier names exactly as they appear on the invoice (including Chinese characters). For all other text fields (item descriptions, notes, addresses, units, etc.), translate any Chinese or non-English text into English. Keep brand names and product names in their commonly used English form where possible.

Return ONLY valid JSON with this exact structure — always an array, even if there's only one invoice:

{
  "invoices": [
    {
      "supplier_name": "Full supplier/company name from the invoice header (translated to English)",
      "invoice_number": "Invoice number/reference",
      "invoice_date": "YYYY-MM-DD format",
      "venue": "Assembly or Caliente - infer from delivery address or customer name",
      "total_amount": number (total invoice amount),
      "notes": "any special notes, payment terms, or remarks (translated to English)",
      "line_items": [
        {
          "item_code": "product/item code if available, otherwise empty string",
          "description": "item description in English (clean product name without pack size info)",
          "pack_size": "pack/bottle/container size info e.g. '4X4LB', '750ml', '10X(4X145G) (5.8KG)', '6X1L' — extract from the description",
          "quantity": number (number of units ordered, e.g. 1 CTN, 2 PCS),
          "unit": "unit of measure in English (CTN, PCS, BOT, Case, PKT, etc.)",
          "weight": number or null (actual weight in KG if item is priced per KG, otherwise null),
          "unit_price": number (price per unit — if priced per KG this is the price per KG),
          "total": number (the total amount from the invoice for this line item)
        }
      ]
    }
  ]
}

Rules:
- CRITICAL: Look for ALL separate invoices in the document. Different invoice numbers or dates mean different invoices.
- CRITICAL: ALL text output MUST be in English. Translate any Chinese or non-English text to English.
- All number fields should be numeric (no currency symbols, no commas)
- If a field is not found, use "" for strings, 0 for numbers, null for weight
- For venue: look for "Assembly" or "Caliente" in the billing/delivery address. "Knutsford Terrace" = Caliente, "Assembly" = Assembly
- Parse ALL line items from each invoice table
- The date should always be in YYYY-MM-DD format, converting from DD/MM/YYYY if needed
- Return ONLY the JSON object, no markdown, no explanation
- Pages that are continuations of the same invoice (same invoice number) should have their line items merged into one invoice entry
- IMPORTANT for weight-based items: When an item shows a weight (e.g. "16.3300 KG") and a price per KG (e.g. "310.00/KG"), set weight to the KG value, unit_price to the per-KG price, and total to weight * unit_price. The quantity is the number of pieces/cartons ordered.
- Use the TOTAL AMOUNT column from the invoice as the "total" field — do NOT recalculate it`;

    const requestBody = JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "application/pdf"};base64,${fileBase64}`,
              },
            },
            {
              type: "text",
              text: "Extract ALL invoices from this document. There may be multiple invoices across pages. Return every single one.",
            },
          ],
        },
      ],
    });

    const MAX_RETRIES = 3;
    let extractedData: any = null;
    let lastError = "";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: requestBody,
          }
        );

        if (!response.ok) {
          const statusCode = response.status;
          if (statusCode === 429) {
            return new Response(
              JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again in a moment." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (statusCode === 402) {
            return new Response(
              JSON.stringify({ success: false, error: "AI credits exhausted." }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const errText = await response.text();
          console.error(`AI gateway error (attempt ${attempt + 1}):`, statusCode, errText);
          lastError = `HTTP ${statusCode}: ${errText}`;
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
            continue;
          }
          return new Response(
            JSON.stringify({ success: false, error: "AI service temporarily unavailable. Please try again in a moment." }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Parse gateway response
        const responseText = await response.text();
        if (!responseText) {
          console.error(`Empty response (attempt ${attempt + 1})`);
          lastError = "Empty response";
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
            continue;
          }
          return new Response(
            JSON.stringify({ success: false, error: "AI returned empty response. Try a smaller or clearer image." }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const aiData = JSON.parse(responseText);
        const content = aiData.choices?.[0]?.message?.content || "";

        let cleaned = content.trim();
        if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }

        extractedData = JSON.parse(cleaned);
        // Success — break out of retry loop
        break;
      } catch (err) {
        console.error(`Parse/fetch error (attempt ${attempt + 1}):`, err);
        lastError = String(err);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
          continue;
        }
      }
    }

    if (!extractedData) {
      console.error("All retries failed. Last error:", lastError);
      return new Response(
        JSON.stringify({ success: false, error: "Could not extract invoice data after multiple attempts. Please try again or use a clearer image." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize: support both old single-invoice format and new multi-invoice format
    let invoicesArray;
    if (Array.isArray(extractedData.invoices)) {
      invoicesArray = extractedData.invoices;
    } else if (extractedData.supplier_name || extractedData.invoice_number) {
      // Old single-invoice format fallback
      invoicesArray = [extractedData];
    } else {
      invoicesArray = [extractedData];
    }

    return new Response(
      JSON.stringify({ success: true, data: { invoices: invoicesArray } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("parse-invoice error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
