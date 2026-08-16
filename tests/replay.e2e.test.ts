import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ArtifactStore } from "../src/artifact/store.js";
import { ControlPlane } from "../src/escalation/control.js";
import { RunLog } from "../src/evidence/logger.js";
import { replay } from "../src/replay/executor.js";
import { PolicyConfig } from "../src/safety/policy.js";
import { openBrowser } from "../src/surface/browser.js";
import { ensureTarget } from "../src/cli/ensure-target.js";

const PORT = 3847;

describe("replay against CoreLink", () => {
  let stop: (() => void) | undefined;
  let url: string;

  beforeAll(async () => {
    const t = await ensureTarget(PORT);
    url = t.url;
    stop = t.stop;
  });

  afterAll(() => stop?.());

  async function run(params: Record<string, string>, start = url) {
    const cap = await new ArtifactStore().load("lookup-savings-balance.v1.json");
    const log = new RunLog(`test-${Date.now()}`, "replay", ".runs");
    await log.init({ params });
    const control = new ControlPlane(log.dir);
    await control.init();
    const surface = await openBrowser(start, { headed: false });
    try {
      return await replay({
        capability: cap,
        params,
        surface,
        log,
        policy: PolicyConfig.parse({ allowedHosts: cap.policy.allowedHosts }),
        control,
        unattended: true,
      });
    } finally {
      await surface.dispose();
    }
  }

  it("extracts Jane Doe savings balance", async () => {
    const r = await run({ memberId: "12345" });
    expect(r.status).toBe("success");
    expect(r.outputs.savingsBalance).toMatch(/\$4,250\.18/);
  });

  it("returns a business outcome for unknown member", async () => {
    const r = await run({ memberId: "99999" });
    expect(r.status).toBe("business_outcome");
    expect(r.outcome?.id).toBe("member_not_found");
  });

  it("returns a business outcome for permission denial", async () => {
    const r = await run({ memberId: "88888" });
    expect(r.status).toBe("business_outcome");
    expect(r.outcome?.id).toBe("permission_denied");
  });

  it("fails hard on session expiry", async () => {
    const r = await run({ memberId: "12345" }, `${url}/?expire=1`);
    expect(r.status).toBe("failed");
    expect(r.error?.observed).toMatch(/expired/i);
  });
});
