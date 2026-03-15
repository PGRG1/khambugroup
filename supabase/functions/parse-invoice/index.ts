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
    const { fileBase64, mimeType, productMaster } = await req.json();

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

    const systemPrompt = `You are a highly accurate invoice data extractor for a restaurant/bar business (Assembly and Caliente venues in Hong Kong). A single document may contain MULTIPLE invoices (different dates, different invoice numbers, possibly from the same or different suppliers). You must extract ALL invoices found in the document.

IMPORTANT — LANGUAGE RULES:
- Supplier names: Keep EXACTLY as they appear on the invoice (including Chinese characters). Do NOT translate supplier names.
- ALL OTHER text fields MUST be in English. You MUST translate Chinese/non-English text to English. This includes:
  - "unit" field: translate Chinese units to English abbreviations. Common translations: 桶=Bucket, 打=Dozen, 條=Roll, 箱=Case/Box, 瓶=Bottle, 包=Pack, 袋=Bag, 罐=Can, 盒=Box, 支=Piece, 公升=Liter, 磅=LB
  - "description" field: must be in English
  - "pack_size" field: translate Chinese size units (e.g. "3.8公升/桶" → "3.8L/Bucket", "40p/桶" → "40p/Bucket", "15"/條" → "15"/Roll")
  - "notes" field: must be in English

CRITICAL — NUMBER ACCURACY RULES:
- Read EVERY number carefully from the invoice. Numbers are the most important part.
- "quantity" = the number in the QTY/QUANTITY column. It is typically a small integer (1-20). If you see a large number in the quantity field, double-check — it is likely wrong.
- "unit_price" = the price per unit from the UNIT PRICE / PRICE column. Cross-check: quantity × unit_price should approximately equal the line total.
- "total" = the AMOUNT column value for that line item. Read it directly from the invoice — do NOT calculate it.
- "total_amount" on the invoice header = the grand TOTAL shown at the bottom. Read it directly.
- VALIDATION: For each line item, verify that quantity × unit_price ≈ total (within rounding). If they don't match, re-read the numbers from the image more carefully.
- Watch for multi-page invoices: the same invoice number on consecutive pages means those pages belong together. Merge all line items and use the grand total from the last page.
- Be careful with columns — some invoices have a DISCOUNT column between UNIT PRICE and AMOUNT. Don't confuse discount with amount.

Return ONLY valid JSON with this exact structure — always an array, even if there's only one invoice:

    {
      "invoices": [
        {
          "supplier_name": "Keep exactly as on invoice, including Chinese characters",
          "invoice_number": "Invoice number/reference",
          "invoice_date": "YYYY-MM-DD format",
          "due_date": "YYYY-MM-DD format or empty string if not shown on invoice",
          "venue": "Assembly or Caliente - infer from delivery address or customer name",
          "total_amount": number (total invoice amount — read from the TOTAL line on the invoice),
          "notes": "any special notes, payment terms, or remarks (in English)",
      "line_items": [
        {
          "item_code": "product/item code if available, otherwise empty string",
          "description": "item description in English (clean product name without pack size info)",
          "pack_size": "pack/bottle/container size info in English e.g. '4X4LB', '750ml', '3.8L/Bucket', '6X1L'",
          "quantity": number (number of units ordered — typically 1-20),
          "unit": "unit of measure in ENGLISH ONLY (Bucket, Dozen, Roll, Case, Box, Pack, Bag, Bottle, Piece, KG, LB, etc.) — NEVER Chinese characters",
          "weight": number or null (actual weight in KG if item is priced per KG, otherwise null),
          "unit_price": number (price per unit — if priced per KG this is the price per KG),
          "total": number (the total amount from the AMOUNT column for this line item)
        }
      ]
    }
  ]
}

Rules:
- CRITICAL: Look for ALL separate invoices in the document. Different invoice numbers or dates mean different invoices.
- CRITICAL: The "unit" field must NEVER contain Chinese characters. Always use English unit names.
- CRITICAL: Read numbers precisely. Do not confuse columns. quantity is always a small count, unit_price is the per-unit cost, total/amount is the line total.
- All number fields should be numeric (no currency symbols, no commas)
- If a field is not found, use "" for strings, 0 for numbers, null for weight
- For venue: look for "Assembly", "Caliente", or "Hanabi" in the billing/delivery address. "Knutsford Terrace" = Caliente, "Assembly" = Assembly, "Hanabi" = Hanabi
- Parse ALL line items from each invoice table
- The date should always be in YYYY-MM-DD format, converting from DD/MM/YYYY if needed
- IMPORTANT: Look for a DUE DATE, PAYMENT DUE, or similar field on the invoice. Extract it into "due_date" in YYYY-MM-DD format. If no due date is found, use an empty string.
- Return ONLY the JSON object, no markdown, no explanation
- Pages that are continuations of the same invoice (same invoice number) should have their line items merged into one invoice entry
- IMPORTANT for weight-based items: When an item shows a weight (e.g. "16.3300 KG") and a price per KG (e.g. "310.00/KG"), set weight to the KG value, unit_price to the per-KG price, and total to weight * unit_price. The quantity is the number of pieces/cartons ordered.
- Use the TOTAL AMOUNT column from the invoice as the "total" field — do NOT recalculate it`;

    const requestBody = JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 16000,
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
              text: "Extract ALL invoices from this document. There may be multiple invoices across pages. Read every number carefully and accurately. Return every single invoice found.",
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout
        const response = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: requestBody,
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

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
      invoicesArray = [extractedData];
    } else {
      invoicesArray = [extractedData];
    }

    // Post-process: force-translate any remaining Chinese characters in unit/pack_size fields
    const chineseToEnglish: Record<string, string> = {
      "桶": "Bucket", "打": "Dozen", "條": "Roll", "箱": "Case",
      "瓶": "Bottle", "包": "Pack", "袋": "Bag", "罐": "Can",
      "盒": "Box", "支": "Piece", "磅": "LB", "公斤": "KG",
      "公升": "L", "隻": "Piece", "對": "Pair", "件": "Piece",
      "塊": "Piece", "份": "Portion", "套": "Set", "扎": "Bundle",
    };

    function translateChinese(text: string): string {
      if (!text) return text;
      let result = text;
      for (const [zh, en] of Object.entries(chineseToEnglish)) {
        result = result.replaceAll(zh, en);
      }
      return result;
    }

    for (const inv of invoicesArray) {
      if (inv.line_items && Array.isArray(inv.line_items)) {
        for (const li of inv.line_items) {
          if (li.unit) li.unit = translateChinese(li.unit);
          if (li.pack_size) li.pack_size = translateChinese(li.pack_size);
          if (li.description) li.description = translateChinese(li.description);
          if (li.notes) li.notes = translateChinese(li.notes);
        }
      }
      if (inv.notes) inv.notes = translateChinese(inv.notes);
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
