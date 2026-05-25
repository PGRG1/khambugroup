import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireAuth(req, corsHeaders);
  if (auth.response) return auth.response;

  try {
    const { fileBase64, mimeType, productMaster, files } = await req.json();

    let fileEntries: { base64: string; mimeType: string }[] = [];
    if (files && Array.isArray(files) && files.length > 0) {
      fileEntries = files;
    } else if (fileBase64) {
      fileEntries = [{ base64: fileBase64, mimeType: mimeType || "application/pdf" }];
    }

    if (fileEntries.length === 0) {
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

CRITICAL — READ NUMBERS WITH EXTREME CARE:
- Read EVERY digit individually. Do not guess or approximate.
- For each number, confirm by reading it digit by digit from left to right.
- Pay close attention to similar-looking characters: 0 vs O, 1 vs l vs I, 5 vs S, 6 vs G, 8 vs B, 2 vs Z.
- If a number is partially obscured or ambiguous, state your best reading but prefer the interpretation that makes the line item math (qty × unit_price = total) work out.
- Be aware of column alignment — numbers in the QTY column are quantities, numbers in the PRICE column are prices. Do not mix up columns.
- Some invoices use very small or compressed fonts. Zoom in mentally and read each character carefully.

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
- "total_amount" on the invoice header = the grand TOTAL shown at the bottom. Read it directly. This is critical for validation.
- VALIDATION: For each line item, verify that quantity × unit_price ≈ total (within rounding). If they don't match, re-read the numbers from the image more carefully.
- Watch for multi-page invoices: the same invoice number on consecutive pages means those pages belong together. Merge all line items and use the grand total from the last page.
- Be careful with columns — some invoices have a DISCOUNT column between UNIT PRICE and AMOUNT. Don't confuse discount with amount.

CRITICAL — SUPPLIER NAME ACCURACY:
- Read the supplier/company name character by character. Do not guess or autocomplete.
- For Chinese characters, reproduce them exactly as printed.
- For English names, spell them exactly including any abbreviations, periods, or unusual formatting.

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
          "discount": number (line-level discount amount in dollars if shown, otherwise 0),
          "total": number (the total amount from the AMOUNT column for this line item — after discount)
        }
      ]
    }
  ]
}

CRITICAL — RETURNED/EMPTY KEGS (MUST FOLLOW EXACTLY — DO NOT SKIP):
Look for sections labeled "Returned 收回", "Empty KEG 酒桶", "空桶", or similar at the bottom of invoices (often after the main line items table). These list returned empty kegs with quantities (e.g., "ASAHI 10L ×1", "PERONI 19L ×8").
For EACH returned keg, add a line item using the EXACT values below. Do NOT use the pack_size, unit, or price from the invoice — use ONLY the values from this mapping table:

When you see "ASAHI 10L" in returned section → item_code: "ABADEK", description: "ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 10L", pack_size: "", unit: "Keg", unit_price: 50
When you see "ASAHI 20L" → item_code: "ABADE2", description: "ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 20L", pack_size: "", unit: "Keg", unit_price: 50
When you see "ASAHI SOUR" or "ASAHI SOUR (BLUE)" → item_code: "ABASEK", description: "ASAHI SOUR KEG (EMPTY) DEPOSIT - 10L", pack_size: "", unit: "Keg", unit_price: 50
When you see "PERONI" → item_code: "ABPNEK", description: "PERONI NASTRO AZZURRO KEG (EMPTY) DEP - 19L", pack_size: "", unit: "Keg", unit_price: 50
When you see "KURONAMA" or "DARK" keg → item_code: "ABAKBKZJ", description: "ASAHI KURONAMA DARK KEG (EMPTY) DEPOSIT - 10L", pack_size: "", unit: "Keg", unit_price: 50
When you see "SINGHA" → item_code: "", description: "SINGHA KEG (EMPTY) DEPOSIT - 30L", pack_size: "", unit: "Keg", unit_price: 50

Additional rules for returned kegs:
- quantity MUST be NEGATIVE (e.g., -1, -8)
- unit_price MUST be 50 — NEVER 0
- total = quantity × 50 (will be negative, e.g., -400)
- pack_size MUST be "" (empty string) — NEVER "4X4LB" or any other value
- unit MUST be "Keg" — NEVER "CTN"
- Do NOT skip these items — they represent deposit refunds and are financially important

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
- Pages that are continuations of the same invoice (same invoice number) should have their line items merged into one invoice entry`;

    // Build product master context for matching
    let productMasterContext = "";
    if (productMaster && Array.isArray(productMaster) && productMaster.length > 0) {
      const pmLines = productMaster.map((pm: any) =>
        `SKU:${pm.internal_sku} | Name:${pm.internal_product_name} | SupplierName:${pm.supplier_product_name} | ExtSKU:${pm.external_sku}`
      ).join("\n");
      productMasterContext = `\n\nPRODUCT MASTER MATCHING — CRITICAL INSTRUCTIONS:
Below is the Product Master list. For EACH line item you extract, you MUST try to match it to the closest Product Master entry.

PRIORITY — MATCH BY ExtSKU FIRST:
- If the invoice line item has an item_code/product code, ALWAYS try matching it against "ExtSKU" FIRST. An exact ExtSKU match takes absolute priority over any description matching.
- Only if no ExtSKU match is found, fall back to comparing the extracted product description against "SupplierName" and "Name" fields.
- If you find a match, add "matched_sku": "<internal_sku value>" to that line item
- If NO match is found, set "matched_sku": ""
- Be flexible with matching: ignore minor differences in spacing, capitalization, abbreviations (e.g. "J.W." vs "JW", "Whisky" vs "Whiskey", "75CL" vs "750ML")
- The product description on the invoice may be slightly different from Product Master — use your best judgment

PRODUCT MASTER LIST:
${pmLines}`;
    }

    const fullSystemPrompt = systemPrompt + productMasterContext;

    // Build user content with all file entries as separate images
    const userContent: any[] = fileEntries.map((entry) => ({
      type: "image_url",
      image_url: {
        url: `data:${entry.mimeType};base64,${entry.base64}`,
      },
    }));
    userContent.push({
      type: "text",
      text: fileEntries.length > 1
        ? `These ${fileEntries.length} images/files are pages of the same document or related invoices. Extract ALL invoices found across all pages. Pages with the same invoice number belong to the same invoice — merge their line items. Read every number carefully and accurately, digit by digit.`
        : "Extract ALL invoices from this document. There may be multiple invoices across pages. Read every number carefully and accurately, digit by digit. Return every single invoice found.",
    });

    // --- FIRST PASS: Extract data ---
    const extractionBody = JSON.stringify({
      model: "google/gemini-2.5-flash",
      max_tokens: 32000,
      messages: [
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const MAX_RETRIES = 3;
    let extractedData: any = null;
    let lastError = "";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 180000); // 3 min timeout for pro model
        const response = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: extractionBody,
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

    // --- SECOND PASS: Verification ---
    try {
      const verificationPrompt = `You previously extracted the following invoice data from the document images. Please re-examine the images and VERIFY every number is correct. Focus especially on:
1. Quantities — are they really what's shown in the QTY column?
2. Unit prices — are they from the correct PRICE column (not the AMOUNT or DISCOUNT column)?
3. Line totals — do they match what's in the AMOUNT column?
4. Invoice total — does it match the grand total shown on the invoice?
5. Supplier name — is it spelled exactly as printed?
6. Invoice number — is every character correct?

Here is the extracted data to verify:
${JSON.stringify(extractedData, null, 2)}

If ANY numbers are wrong, return the CORRECTED complete JSON in the exact same format. If everything is correct, return the data unchanged. Return ONLY the JSON, no explanation.`;

      const verifyContent: any[] = fileEntries.map((entry) => ({
        type: "image_url",
        image_url: { url: `data:${entry.mimeType};base64,${entry.base64}` },
      }));
      verifyContent.push({ type: "text", text: verificationPrompt });

      const verifyController = new AbortController();
      const verifyTimeout = setTimeout(() => verifyController.abort(), 180000);
      const verifyResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            max_tokens: 32000,
            messages: [
              { role: "system", content: "You are verifying invoice data extraction accuracy. Return only corrected JSON." },
              { role: "user", content: verifyContent },
            ],
          }),
          signal: verifyController.signal,
        }
      );
      clearTimeout(verifyTimeout);

      if (verifyResponse.ok) {
        const verifyText = await verifyResponse.text();
        if (verifyText) {
          const verifyAiData = JSON.parse(verifyText);
          const verifyContent2 = verifyAiData.choices?.[0]?.message?.content || "";
          let verifyCleaned = verifyContent2.trim();
          if (verifyCleaned.startsWith("```")) {
            verifyCleaned = verifyCleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }
          try {
            const verifiedData = JSON.parse(verifyCleaned);
            extractedData = verifiedData;
            console.log("Verification pass completed — using verified data");
          } catch {
            console.warn("Verification pass returned invalid JSON — using original extraction");
          }
        }
      } else {
        const vt = await verifyResponse.text();
        console.warn("Verification pass failed:", verifyResponse.status, vt);
      }
    } catch (verifyErr) {
      console.warn("Verification pass error (non-fatal):", verifyErr);
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

    // Post-process: force-correct returned keg deposit items regardless of AI output
    const kegMappings: { pattern: RegExp; item_code: string; description: string }[] = [
      { pattern: /asahi\s*(super\s*dry\s*)?20\s*l/i, item_code: "ABADE2", description: "ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 20L" },
      { pattern: /asahi\s*sour|asahi\s*sour\s*\(blue\)/i, item_code: "ABASEK", description: "ASAHI SOUR KEG (EMPTY) DEPOSIT - 10L" },
      { pattern: /kuronama|dark.*keg/i, item_code: "ABAKBKZJ", description: "ASAHI KURONAMA DARK KEG (EMPTY) DEPOSIT - 10L" },
      { pattern: /asahi\s*(super\s*dry\s*)?10\s*l|asahi\s*(super\s*dry\s*)?keg(?!.*20)/i, item_code: "ABADEK", description: "ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 10L" },
      { pattern: /peroni/i, item_code: "ABPNEK", description: "PERONI NASTRO AZZURRO KEG (EMPTY) DEP - 19L" },
      { pattern: /singha/i, item_code: "", description: "SINGHA KEG (EMPTY) DEPOSIT - 30L" },
    ];

    for (const inv of invoicesArray) {
      if (inv.line_items && Array.isArray(inv.line_items)) {
        for (const li of inv.line_items) {
          if (li.unit) li.unit = translateChinese(li.unit);
          if (li.pack_size) li.pack_size = translateChinese(li.pack_size);
          if (li.description) li.description = translateChinese(li.description);
          if (li.notes) li.notes = translateChinese(li.notes);

          // Force-correct returned keg items: if quantity is negative, match against keg mappings
          if (li.quantity < 0) {
            const desc = (li.description || "").toLowerCase();
            for (const mapping of kegMappings) {
              if (mapping.pattern.test(desc)) {
                li.item_code = mapping.item_code;
                li.description = mapping.description;
                li.pack_size = "";
                li.unit = "Keg";
                if (!li.unit_price || li.unit_price === 0) li.unit_price = 50;
                li.total = li.quantity * li.unit_price;
                break;
              }
            }
          }
        }
      }
      if (inv.notes) inv.notes = translateChinese(inv.notes);
    }

    // --- AGENT 2: Invoice Review & Correction Agent ---
    // Reviews Agent 1 output, applies safe corrections, flags risky values for human review,
    // assigns one Items Master status per line.
    let review: any = null;
    try {
      const pmSummary = (productMaster && Array.isArray(productMaster) && productMaster.length > 0)
        ? productMaster.slice(0, 800).map((pm: any) =>
            `SKU:${pm.internal_sku} | Name:${pm.internal_product_name} | SupplierName:${pm.supplier_product_name || ""} | ExtSKU:${pm.external_sku || ""} | Supplier:${pm.supplier || ""} | PurchUOM:${pm.purchase_unit || ""} | StockUOM:${pm.stock_uom || ""} | Cost:${pm.purchase_unit_cost ?? ""}`
          ).join("\n")
        : "(empty)";

      const supplierListText = (productMaster && Array.isArray(productMaster))
        ? Array.from(new Set(productMaster.map((p: any) => p.supplier).filter(Boolean))).join(" | ")
        : "";

      const reviewerSystem = `You are the Invoice Review & Correction Agent.
Agent 1 has extracted invoice data from an image. Your job is to REVIEW and CORRECT it — not to comment on it.

For every field decide: keep as-is, safely correct, or flag for human review.

YOU MAY SAFELY CORRECT (return in line_corrections / header_corrections):
- supplier_name: only if there is a clear match in the known supplier list
- invoice_date / due_date: normalize to YYYY-MM-DD
- currency: normalize codes (HKD, USD, etc.)
- unit (UOM): normalize formatting (e.g. "btl" -> "Bottle", "pcs" -> "Piece")
- description: clean obvious OCR noise without changing meaning
- item_code / matched_sku: set when there is a CLEAR Items Master match

YOU MUST NEVER SILENTLY CHANGE (flag only):
- quantity, unit_price, subtotal, tax, discount, total_amount, line total
If these look wrong, raise a flag — severity "warning" for small/rounding diffs, "blocking" for material ones.

MATH CHECKS (flags only):
- per line: |qty * unit_price - discount - total| > 0.05 -> warning; > 1.00 -> blocking
- sum of line totals vs invoice total: diff > 1.00 -> warning; > 5.00 -> blocking

MISSING REQUIRED HEADER FIELDS (header_flags, "blocking"): supplier_name, invoice_number, invoice_date, total_amount.

ITEMS MASTER STATUS — exactly ONE per line:
- "matched": confident exact/near-exact match. Return matched_sku.
- "possible_match": multiple plausible candidates. Return up to 3 candidate internal_sku values.
- "new_item": no plausible match. Return a suggested_new_item draft.
- "needs_review": data too incomplete/ambiguous to decide.

For EVERY correction return: field, original, corrected, reason (short), confidence (0-1).
If unsure, prefer a flag over a correction.

Known suppliers: ${supplierListText || "(none)"}

Return ONLY by calling the report_review function.`;

      const reviewerUserText = `EXTRACTED INVOICES (from Agent 1):\n${JSON.stringify({ invoices: invoicesArray }, null, 2)}\n\nITEMS MASTER (first 800 rows):\n${pmSummary}`;

      const correctionItem = {
        type: "object",
        properties: {
          invoice_index: { type: "integer" },
          line_index: { type: "integer" },
          field: { type: "string" },
          original: { type: "string" },
          corrected: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["invoice_index", "field", "original", "corrected", "reason", "confidence"],
        additionalProperties: false,
      };
      const flagItem = {
        type: "object",
        properties: {
          invoice_index: { type: "integer" },
          line_index: { type: "integer" },
          field: { type: "string" },
          severity: { type: "string", enum: ["warning", "blocking"] },
          message: { type: "string" },
        },
        required: ["invoice_index", "field", "severity", "message"],
        additionalProperties: false,
      };

      const reviewerBody = {
        model: "google/gemini-2.5-flash",
        max_tokens: 16000,
        messages: [
          { role: "system", content: reviewerSystem },
          { role: "user", content: reviewerUserText },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_review",
              description: "Report corrections, flags, and items-master status for each invoice line.",
              parameters: {
                type: "object",
                properties: {
                  header_corrections: { type: "array", items: correctionItem },
                  line_corrections: { type: "array", items: correctionItem },
                  header_flags: { type: "array", items: flagItem },
                  line_flags: { type: "array", items: flagItem },
                  item_master: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        invoice_index: { type: "integer" },
                        line_index: { type: "integer" },
                        status: { type: "string", enum: ["matched", "possible_match", "new_item", "needs_review"] },
                        matched_sku: { type: "string" },
                        candidates: { type: "array", items: { type: "string" } },
                        reason: { type: "string" },
                        confidence: { type: "number" },
                        suggested_new_item: {
                          type: "object",
                          properties: {
                            internal_product_name: { type: "string" },
                            supplier_product_name: { type: "string" },
                            external_sku: { type: "string" },
                            supplier: { type: "string" },
                            pack_size: { type: "string" },
                            purchase_unit: { type: "string" },
                            stock_uom: { type: "string" },
                            purchase_unit_cost: { type: "number" },
                            level1_category: { type: "string" },
                          },
                        },
                      },
                      required: ["invoice_index", "line_index", "status"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["header_corrections", "line_corrections", "header_flags", "line_flags", "item_master"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_review" } },
      };

      const reviewerController = new AbortController();
      const reviewerTimeout = setTimeout(() => reviewerController.abort(), 180000);
      const reviewerResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reviewerBody),
        signal: reviewerController.signal,
      });
      clearTimeout(reviewerTimeout);

      if (reviewerResp.ok) {
        const rText = await reviewerResp.text();
        const rData = JSON.parse(rText);
        const toolCall = rData.choices?.[0]?.message?.tool_calls?.[0];
        const argsStr = toolCall?.function?.arguments || "";
        if (argsStr) {
          try {
            review = JSON.parse(argsStr);
          } catch (e) {
            console.warn("Reviewer returned non-JSON tool args:", e);
          }
        } else {
          console.warn("Reviewer returned no tool call");
        }
      } else {
        const errText = await reviewerResp.text();
        console.warn("Reviewer agent failed:", reviewerResp.status, errText);
      }
    } catch (reviewErr) {
      console.warn("Reviewer agent error (non-fatal):", reviewErr);
    }

    // Apply ALLOWED corrections server-side. Numeric fields are NEVER overwritten.
    const allowedHeaderFields = new Set(["supplier_name", "invoice_date", "due_date", "currency", "venue"]);
    const allowedLineFields = new Set(["description", "unit", "pack_size", "item_code", "matched_sku"]);
    if (review && typeof review === "object") {
      for (const c of review.header_corrections || []) {
        const inv = invoicesArray[c.invoice_index];
        if (!inv || !allowedHeaderFields.has(c.field)) continue;
        inv[c.field] = c.corrected;
      }
      for (const c of review.line_corrections || []) {
        const inv = invoicesArray[c.invoice_index];
        const line = inv?.line_items?.[c.line_index];
        if (!line || !allowedLineFields.has(c.field)) continue;
        line[c.field] = c.corrected;
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: { invoices: invoicesArray, review } }),
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
