import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCapability } from "../src/artifact/schema.js";

describe("capability schema", () => {
  it("accepts the seed lookup artifact", () => {
    const raw = JSON.parse(readFileSync("capabilities/lookup-savings-balance.v1.json", "utf8"));
    const cap = parseCapability(raw);
    expect(cap.steps.length).toBeGreaterThan(2);
    expect(cap.contract.params[0]?.name).toBe("memberId");
    expect(cap.outcomes.some((o) => o.kind === "business")).toBe(true);
    expect(cap.outcomes.some((o) => o.kind === "recoverable")).toBe(true);
    expect(cap.outcomes.some((o) => o.kind === "hard")).toBe(true);
  });

  it("rejects an artifact with no locator strategies", () => {
    const raw = JSON.parse(readFileSync("capabilities/lookup-savings-balance.v1.json", "utf8"));
    raw.steps[1].target.strategies = [];
    expect(() => parseCapability(raw)).toThrow();
  });
});
