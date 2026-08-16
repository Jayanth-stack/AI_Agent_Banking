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

export async function decide(opts: {
  goal: string;
  params: Record<string, string>;
  snapshot: string;
  uri: string;
  title: string;
  lastResult?: string;
  step: number;
}): Promise<Decision> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required for discovery");

  const client = new OpenAI({ apiKey: key });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";

  const user = [
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

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  return Decision.parse(JSON.parse(raw));
}
