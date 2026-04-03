import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TITLE_TOKENS_PER_ITEM = 45;
const TITLE_BASE_TOKENS = 2500;
const DEFAULT_MAX_TOKENS = 12288;
const MAX_OUTPUT_TOKENS = 16384;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, system_prompt, user_input } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const requestedCount = Number(user_input?.count ?? 0);
    const safeRequestedCount = Number.isFinite(requestedCount) ? requestedCount : 0;
    const max_tokens = mode === "TITLES"
      ? Math.min(TITLE_BASE_TOKENS + Math.max(safeRequestedCount, 1) * TITLE_TOKENS_PER_ITEM, MAX_OUTPUT_TOKENS)
      : DEFAULT_MAX_TOKENS;

    const messages = [
      { role: "system", content: system_prompt },
      { role: "user", content: `MODE: ${mode}\n${JSON.stringify(user_input)}` },
    ];

    const callOpenAI = async (msgs: any[]) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000); // 120s timeout
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: msgs,
            max_tokens,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const response = await callOpenAI(messages);

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait and try again." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402 || response.status === 401) {
      const t = await response.text();
      console.error("OpenAI auth/billing error:", response.status, t);
      return new Response(JSON.stringify({ error: "OpenAI API error: check your API key or billing." }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      console.error("OpenAI API error:", response.status, t);
      return new Response(JSON.stringify({ error: "OpenAI API error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    let parsed: any = null;

    const cleanAndRepairJSON = (raw: string): any => {
      let cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

      try { return JSON.parse(cleaned); } catch { /* continue */ }

      const jsonStart = cleaned.search(/[\{\[]/);
      if (jsonStart > 0) cleaned = cleaned.slice(jsonStart);

      cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
      cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (c) => c === "\n" ? " " : "");

      try { return JSON.parse(cleaned); } catch { /* continue */ }

      const quoteCount = (cleaned.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) cleaned += '"';

      const opens = { "[": 0, "{": 0 };
      for (const ch of cleaned) {
        if (ch === "[") opens["["]++;
        else if (ch === "{") opens["{"]++;
        else if (ch === "]" && opens["["] > 0) opens["["]--;
        else if (ch === "}" && opens["{"] > 0) opens["{"]--;
      }

      cleaned = cleaned.replace(/,\s*$/, "");
      cleaned += "]".repeat(opens["["]) + "}".repeat(opens["{"]);

      return JSON.parse(cleaned);
    };

    try {
      parsed = cleanAndRepairJSON(content);
    } catch {
      console.log("First parse failed, retrying with correction prompt");
      const retryMessages = [
        ...messages,
        { role: "assistant", content: content },
        { role: "user", content: "Tu respuesta no es JSON válido. Devuelve SOLO JSON válido, sin texto extra, sin markdown." },
      ];

      const retryResponse = await callOpenAI(retryMessages);

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
