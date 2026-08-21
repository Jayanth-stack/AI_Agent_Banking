import { afterEach, describe, expect, it } from "vitest";
import { parseDecision, resolveProvider } from "../src/agent/llm.js";

describe("decision parsing", () => {
  it("parses a raw JSON object", () => {
    const d = parseDecision(
      JSON.stringify({
        reasoning: "search then extract",
        done: false,
        action: "fill",
        paramRef: "memberId",
        description: "Enter member ID",
      }),
    );
    expect(d.action).toBe("fill");
    expect(d.paramRef).toBe("memberId");
    expect(d.escalate).toBe(false);
  });

  it("strips markdown fences Gemini sometimes wraps around JSON", () => {
    const d = parseDecision('```json\n{"reasoning":"ok","done":true}\n```');
    expect(d.done).toBe(true);
    expect(d.reasoning).toBe("ok");
  });
});

describe("provider resolution", () => {
  const prev = {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("prefers Gemini when both keys exist", () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.OPENAI_API_KEY = "o";
    delete process.env.LLM_PROVIDER;
    expect(resolveProvider()).toBe("gemini");
  });

  it("falls back to OpenAI", () => {
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = "o";
    delete process.env.LLM_PROVIDER;
    expect(resolveProvider()).toBe("openai");
  });

  it("honors LLM_PROVIDER=openai", () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.OPENAI_API_KEY = "o";
    process.env.LLM_PROVIDER = "openai";
    expect(resolveProvider()).toBe("openai");
  });
});
