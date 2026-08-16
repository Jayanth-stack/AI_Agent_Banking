import { describe, expect, it } from "vitest";
import { DEFAULT_OUTCOMES } from "../src/artifact/builder.js";
import { checkpointHolds, classify } from "../src/replay/outcomes.js";
import type { Perception } from "../src/surface/types.js";

function p(over: Partial<Perception>): Perception {
  return {
    surfaceKind: "web",
    title: "Member Search — CoreLink",
    uri: "http://127.0.0.1:3847/",
    tree: { role: "document" },
    snapshot: "- document",
    visibleText: "",
    dialogs: [],
    ...over,
  };
}

describe("outcome taxonomy", () => {
  it("treats not-found as business, not failure", () => {
    const hit = classify(p({ visibleText: "No member record matches the ID entered." }), DEFAULT_OUTCOMES);
    expect(hit.hit).toBe(true);
    if (hit.hit) {
      expect(hit.detector.kind).toBe("business");
      expect(hit.detector.id).toBe("member_not_found");
    }
  });

  it("treats session expiry as hard", () => {
    const hit = classify(p({ visibleText: "Your teller session has expired. Sign in again" }), DEFAULT_OUTCOMES);
    expect(hit.hit && hit.detector.kind).toBe("hard");
  });

  it("treats system notice as recoverable dismiss", () => {
    const hit = classify(p({ dialogs: ["System Notice"] }), DEFAULT_OUTCOMES);
    expect(hit.hit && hit.detector.kind).toBe("recoverable");
    if (hit.hit) expect(hit.detector.recover?.type).toBe("dismiss");
  });

  it("checkpoint matches url or text", () => {
    expect(
      checkpointHolds(p({ uri: "http://127.0.0.1:3847/member?id=1" }), [{ type: "url_includes", value: "/member" }]),
    ).toBe(true);
    expect(checkpointHolds(p({ uri: "http://127.0.0.1:3847/" }), [{ type: "url_includes", value: "/member" }])).toBe(
      false,
    );
  });
});
