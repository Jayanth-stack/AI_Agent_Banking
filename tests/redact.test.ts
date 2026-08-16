import { describe, expect, it } from "vitest";
import { maskIdentifier, redactByPii, redactRecord, redactText } from "../src/safety/redact.js";

describe("redact", () => {
  it("strips SSN, PAN, email, bearer", () => {
    const s = redactText("ssn 123-45-6789 card 4111111111111111 a@b.com Bearer abc.def");
    expect(s).toContain("[REDACTED_SSN]");
    expect(s).toContain("[REDACTED_PAN]");
    expect(s).toContain("[REDACTED_EMAIL]");
    expect(s).toContain("[REDACTED]");
  });

  it("masks identifiers instead of dropping them", () => {
    expect(maskIdentifier("12345")).toBe("1***45");
  });

  it("redacts secret keys regardless of value", () => {
    const out = redactRecord({ password: "hunter2", memberId: "12345" }, { memberId: "identifier" });
    expect(out.password).toBe("[REDACTED]");
    expect(out.memberId).toBe("1***45");
  });

  it("never writes financial amounts when marked", () => {
    expect(redactByPii("$4,250.18", "financial")).toBe("[REDACTED_AMOUNT]");
  });
});
