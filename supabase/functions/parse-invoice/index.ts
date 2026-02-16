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

    const systemPrompt = `You are an invoice data extractor for a restaurant/bar business (Assembly and Caliente venues in Hong Kong). Extract invoice data from the provided document image. Return ONLY valid JSON with this exact structure:

{
  "supplier_name": "Full supplier/company name from the invoice header",
  "invoice_number": "Invoice number/reference",
  "invoice_date": "YYYY-MM-DD format",
  "venue": "Assembly or Caliente - infer from delivery address or customer name",
  "total_amount": number (total invoice amount),
  "notes": "any special notes, payment terms, or remarks",
  "line_items": [
    {
      "item_code": "product/item code if available, otherwise empty string",
      "description": "item description",
      "quantity": number,
      "unit": "unit of measure (BOT, KG, Case, PKT, etc.)",
      "unit_price": number,
      "total": number (quantity * unit_price)
    }
  ]
}

Rules:
- All number fields should be numeric (no currency symbols, no commas)
- If a field is not found, use "" for strings and 0 for numbers
- For venue: look for "Assembly" or "Caliente" in the billing/delivery address. "Knutsford Terrace" = Caliente, "Assembly" = Assembly
- Parse ALL line items from the invoice table
- The date should always be in YYYY-MM-DD format, converting from DD/MM/YYYY if needed
- Return ONLY the JSON object, no markdown, no explanation
- If multiple pages contain the same invoice, combine all line items`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
                  text: "Extract all invoice data from this document. Include every line item.",
                },
              ],
            },
          ],
        }),
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
      console.error("AI gateway error:", statusCode, errText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to process invoice" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let extractedData;
    try {
      extractedData = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ success: false, error: "Could not parse invoice data. Please try a clearer image." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
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
