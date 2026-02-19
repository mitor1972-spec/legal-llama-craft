import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ~30 tokens per title (Spanish titles average 20-25 tokens + JSON overhead)
const TOKENS_PER_TITLE = 30;
const BASE_TOKENS = 1500; // overhead for JSON structure + topic + block_name

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, system_prompt, user_input } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Calculate max_tokens based on requested count to prevent over-generation
    const requestedCount = user_input?.count ?? null;
    const max_tokens = requestedCount
      ? Math.min(BASE_TOKENS + requestedCount * TOKENS_PER_TITLE, 32768)
      : 8192;

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

    const cleanAndRepairJSON = (raw: string): any => {
      let cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

      // Try direct parse first
      try { return JSON.parse(cleaned); } catch { /* continue to repair */ }

      // Find JSON start
      const jsonStart = cleaned.search(/[\{\[]/);
      if (jsonStart > 0) cleaned = cleaned.slice(jsonStart);

      // Remove trailing commas before closing brackets
      cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

      // Remove control characters
      cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (c) => c === "\n" ? " " : "");

      // Try parse after basic cleanup
      try { return JSON.parse(cleaned); } catch { /* continue to repair */ }

      // Repair truncated JSON: close open strings, arrays, and objects
      // If ends mid-string, close the string first
      const quoteCount = (cleaned.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) cleaned += '"';

      // Count unmatched brackets and close them
      const opens = { "[": 0, "{": 0 };
      const closes = { "]": "[", "}": "{" };
      for (const ch of cleaned) {
        if (ch === "[") opens["["]++;
        else if (ch === "{") opens["{"]++;
        else if (ch === "]" && opens["["] > 0) opens["["]--;
        else if (ch === "}" && opens["{"] > 0) opens["{"]--;
      }

      // Remove trailing comma if present before closing
      cleaned = cleaned.replace(/,\s*$/, "");

      // Close arrays then objects (reverse of typical nesting order)
      cleaned += "]".repeat(opens["["]) + "}".repeat(opens["{"]);

      return JSON.parse(cleaned);
    };

    try {
      parsed = cleanAndRepairJSON(content);
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
          parsed = cleanAndRepairJSON(retryContent);
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
