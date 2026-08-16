import { describe, expect, it } from "vitest";
import { checkAction, checkNavigation, inferRisk, PolicyConfig } from "../src/safety/policy.js";

const policy = PolicyConfig.parse({});

describe("policy", () => {
  it("blocks off-allowlist hosts", () => {
    const d = checkNavigation("https://evil.example/login", policy);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("host");
  });

  it("allows localhost target", () => {
    expect(checkNavigation("http://127.0.0.1:3847/member?id=1", policy).ok).toBe(true);
  });

  it("blocks wire path even on localhost", () => {
    const d = checkNavigation("http://127.0.0.1:3847/wire", policy);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("path");
  });

  it("refuses irreversible unattended actions", () => {
    const d = checkAction("click", "irreversible", policy, { unattended: true });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("irreversible");
  });

  it("allows irreversible when attended", () => {
    expect(checkAction("click", "irreversible", policy, { unattended: false }).ok).toBe(true);
  });

  it("classifies confirm/open-account as irreversible", () => {
    expect(inferRisk("click", "Submit open account")).toBe("irreversible");
    expect(inferRisk("extract", "read balance")).toBe("safe");
  });
});
