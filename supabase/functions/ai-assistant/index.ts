// Server-side proxy for all AI recipe features (search, photo/link upload,
// and the general cooking Q&A assistant). Keeps the Anthropic API key off
// the client entirely. Deployed WITHOUT --no-verify-jwt, so Supabase itself
// rejects any call that isn't from a logged-in user before this code runs.
//
// Required secret (set via `supabase secrets set`, never committed):
//   ANTHROPIC_API_KEY — console.anthropic.com > API Keys
//
// Deploy with: supabase functions deploy ai-assistant

const RECIPE_JSON_SHAPE = `{"name": string, "type": one of ["protein","starch","veg","soup","dessert","combo"], "category": one of ["meat","dairy","parve","fish"], "simplicity": array subset of ["crockpot","under20","under30","onepot"], "ingredients": [{"name": string, "amount": number, "unit": string, "category": string}], "notes": string (numbered directions as plain text), "prepReminders": string}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-haiku-4-5-20251001";

async function callClaude({ content, messages, system, tools, maxTokens = 1200 }: {
  content?: unknown;
  messages?: unknown[];
  system?: string;
  tools?: unknown[];
  maxTokens?: number;
}) {
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: messages || [{ role: "user", content }],
  };
  if (system) body.system = system;
  if (tools) body.tools = tools;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(data?.error?.message || `Request failed (${resp.status})`);
  }
  return (data.content || [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text?: string }) => c.text || "")
    .join("\n")
    .trim();
}

function extractJSON(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The AI's response wasn't in the expected format. Try rephrasing.");
  return JSON.parse(match[0]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mode, query, image, link, question, history } = await req.json();

    if (mode === "search") {
      const promptText = `A home cook is searching for a recipe using this request, which may be a dish name, a description, or a phrase describing what they're in the mood for: "${query}". Find or invent a suitable, realistic home-cook-friendly recipe that fits the request. Respond ONLY with JSON, no markdown fences, no preamble, no explanation — just the JSON object, matching exactly this shape:\n${RECIPE_JSON_SHAPE}`;
      const text = await callClaude({ content: promptText });
      return new Response(JSON.stringify({ recipe: extractJSON(text) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "upload") {
      let content: unknown;
      let tools: unknown[] | undefined;
      if (image) {
        const promptText = `Extract a home-cook-friendly recipe from the attached image of a recipe. Respond ONLY with JSON, no markdown fences, no preamble, no explanation — just the JSON object, matching exactly this shape:\n${RECIPE_JSON_SHAPE}`;
        content = [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: promptText },
        ];
      } else if (link) {
        content = `Look up the recipe at this link and extract it: ${link}. Respond ONLY with JSON, no markdown fences, no preamble, no explanation — just the JSON object, matching exactly this shape:\n${RECIPE_JSON_SHAPE}`;
        tools = [{ type: "web_search_20250305", name: "web_search" }];
      } else {
        throw new Error("No image or link provided.");
      }
      const text = await callClaude({ content, tools });
      return new Response(JSON.stringify({ recipe: extractJSON(text) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "ask") {
      const system = "You are a friendly, concise home-cooking assistant inside a meal-planning app called Plan to Dish. Give short, practical, conversational answers — a few sentences or a short list. Don't write out a full recipe unless the user explicitly asks for one.";
      const messages = [...(history || []), { role: "user", content: question }];
      const text = await callClaude({ messages, system, maxTokens: 500 });
      return new Response(JSON.stringify({ answer: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown mode.");
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
