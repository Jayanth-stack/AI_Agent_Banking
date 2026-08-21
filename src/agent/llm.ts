import OpenAI from "openai";
import { z } from "zod";

export const Decision = z.object({
  reasoning: z.string(),
  done: z.boolean(),
  escalate: z.boolean().default(false),
  escalateReason: z.string().optional(),
  action: z
    .enum(["click", "fill", "navigate", "extract", "dismiss", "wait", "press"])
    .optional(),
  target: z
    .object({
      role: z.string().optional(),
      name: z.string().optional(),
      text: z.string().optional(),
      title: z.string().optional(),
      nameAttr: z.string().optional(),
      nearText: z.string().optional(),
      rowText: z.string().optional(),
      columnHeader: z.string().optional(),
    })
    .optional(),
  value: z.string().optional(),
  paramRef: z.string().optional(),
  extractAs: z.string().optional(),
  navigateTo: z.string().optional(),
  press: z.string().optional(),
  description: z.string().optional(),
});
export type Decision = z.infer<typeof Decision>;

export type LlmProvider = "gemini" | "openai";

const SYSTEM = `You operate a legacy bank back-office UI through its accessibility tree.
You are in DISCOVERY: figure out how to complete the goal, one action at a time.

Rules:
- Prefer role + accessible name (or title) when targeting controls.
- For table values (e.g. a Savings balance), target the row by its Type text and extract the balance cell. Set rowText and columnHeader.
- Never invent credentials. Never leave the allowlisted host.
- If you see a System Notice / interstitial, dismiss it (click OK) before continuing.
- When the goal is satisfied, extract any requested data, then set done=true.
- If you are looping or cannot proceed safely, set escalate=true and explain why.
- Parameterize typed values that came from the goal (paramRef: "memberId").
- Keep actions minimal. Click, fill, extract, dismiss. Do not wander.

Return JSON only matching the schema.`;

export function resolveProvider(): LlmProvider {
  const forced = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini" || forced === "openai") {
    if (forced === "gemini" && !process.env.GEMINI_API_KEY) {
      throw new Error("LLM_PROVIDER=gemini but GEMINI_API_KEY is not set");
    }
    if (forced === "openai" && !process.env.OPENAI_API_KEY) {
      throw new Error("LLM_PROVIDER=openai but OPENAI_API_KEY is not set");
    }
    return forced;
  }
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  throw new Error("Discovery needs GEMINI_API_KEY (preferred) or OPENAI_API_KEY. Replay does not need a model.");
}

export function parseDecision(raw: string): Decision {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/u, "");
  try {
    return Decision.parse(JSON.parse(trimmed));
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return Decision.parse(JSON.parse(trimmed.slice(start, end + 1)));
    }
    throw new Error(`Model returned non-JSON decision: ${raw.slice(0, 400)}`);
  }
}

function userPrompt(opts: {
  goal: string;
  params: Record<string, string>;
  snapshot: string;
  uri: string;
  title: string;
  lastResult?: string;
  step: number;
}): string {
  return [
    `Goal: ${opts.goal}`,
    `Known params: ${JSON.stringify(opts.params)}`,
    `Step: ${opts.step}`,
    `URL: ${opts.uri}`,
    `Title: ${opts.title}`,
    opts.lastResult ? `Last action result: ${opts.lastResult}` : "",
    `Accessibility tree:`,
    opts.snapshot,
  ]
    .filter(Boolean)
    .join("\n");
}

async function decideGemini(user: string): Promise<Decision> {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  const body = (await res.json()) as {
    error?: { message?: string; status?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${body.error?.message ?? res.statusText}`);
  }

  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}";
  return parseDecision(text);
}

async function decideOpenAI(user: string): Promise<Decision> {
  const key = process.env.OPENAI_API_KEY!;
  const client = new OpenAI({ apiKey: key });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  return parseDecision(completion.choices[0]?.message?.content ?? "{}");
}

export async function decide(opts: {
  goal: string;
  params: Record<string, string>;
  snapshot: string;
  uri: string;
  title: string;
  lastResult?: string;
  step: number;
}): Promise<Decision> {
  const provider = resolveProvider();
  const user = userPrompt(opts);
  return provider === "gemini" ? decideGemini(user) : decideOpenAI(user);
}
