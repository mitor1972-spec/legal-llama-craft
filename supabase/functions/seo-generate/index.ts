import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ~8 tokens per title (conservative estimate to avoid over/under-generation)
const TOKENS_PER_TITLE = 10;
const BASE_TOKENS = 500; // overhead for JSON structure

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, system_prompt, user_input } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Calculate max_tokens based on requested count to prevent over-generation
    const requestedCount = user_input?.count ?? null;
    const max_tokens = requestedCount
      ? Math.min(BASE_TOKENS + requestedCount * TOKENS_PER_TITLE, 8192)
      : 4096;

    const messages = [
      { role: "system", content: system_prompt },
      { role: "user", content: `MODE: ${mode}\n${JSON.stringify(user_input)}` },
    ];

    const callGateway = async (msgs: any[]) => {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: msgs,
          max_tokens,
        }),
      });
      return response;
    };

    const response = await callGateway(messages);

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait and try again." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // Try to extract JSON from content
    let parsed: any = null;
    try {
      // Remove markdown code fences if present
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Retry once with correction
      console.log("First parse failed, retrying with correction prompt");
      const retryMessages = [
        ...messages,
        { role: "assistant", content: content },
        { role: "user", content: "Tu respuesta no es JSON válido. Devuelve SOLO JSON válido, sin texto extra, sin markdown." },
      ];

      const retryResponse = await callGateway(retryMessages);

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        const retryContent = retryData.choices?.[0]?.message?.content || "";
        try {
          const cleaned2 = retryContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          parsed = JSON.parse(cleaned2);
        } catch {
          return new Response(JSON.stringify({ error: "AI returned invalid JSON after retry", raw: retryContent }), {
            status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        await retryResponse.text();
        return new Response(JSON.stringify({ error: "Retry request failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seo-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
