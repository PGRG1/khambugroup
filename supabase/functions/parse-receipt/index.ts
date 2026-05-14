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
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ success: false, error: "No image data provided" }),
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

    const systemPrompt = `You are a sales receipt data extractor for a restaurant/bar business. Extract the following fields from the receipt image. Return ONLY valid JSON with these exact keys:

IMPORTANT: ALL output text MUST be in English. If the document contains Chinese (Traditional or Simplified) or any other non-English language, translate ALL text fields into English before returning them.

{
  "date": "YYYY-MM-DD format",
  "venue": "Assembly or Caliente",
  "reportNumber": "string",
  "orders": number,
  "guests": number,
  "subtotal": number,
  "serviceCharge": number,
  "discount": number,
  "totalSales": number,
  "visa": number,
  "mastercard": number,
  "amex": number,
  "unionPay": number,
  "jcb": number,
  "alipay": number,
  "wechat": number,
  "payme": number,
  "cash": number,
  "cardTips": number
}

Rules:
- All number fields should be numeric (no currency symbols)
- If a field is not found in the receipt, use 0 for numbers and "" for strings
- For the date field: look for "From" date on the receipt and use that date in YYYY-MM-DD format. If there is a date range (From/To), always use the "From" date.
- Do NOT include a "day" field - it will be auto-generated from the date
- Venue should be exactly "Assembly", "Caliente", or "Hanabi" - infer from any branding/headers
- IMPORTANT: "discount" and "cardTips" must BOTH be returned as NEGATIVE numbers (they are deductions). For example, if the receipt shows a discount of 50, return -50. If card tips are 120, return -120.
- Translate any Chinese or non-English text to English
- Return ONLY the JSON object, no markdown, no explanation`;

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
                    url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
                  },
                },
                {
                  type: "text",
                  text: "Extract all sales data fields from this receipt image.",
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
          JSON.stringify({ success: false, error: "AI credits exhausted. Please add credits in Settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", statusCode, errText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to process receipt" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from the response - strip markdown code fences if present
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
        JSON.stringify({ success: false, error: "Could not parse receipt data. Please try a clearer image." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("parse-receipt error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
