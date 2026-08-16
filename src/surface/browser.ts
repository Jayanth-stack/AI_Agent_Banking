import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { resolve } from "./locators.js";
import { collectDialogs, fromAriaSnapshotYaml, visibleText } from "./a11y.js";
import type { ActResult, HumanAction, ISurface, Perception, ProposedAction } from "./types.js";

export type BrowserSurfaceOpts = {
  headed?: boolean;
  cdpPort?: number;
};

export class BrowserSurface implements ISurface {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private recordingCleanup: (() => Promise<void>) | null = null;

  constructor(private readonly opts: BrowserSurfaceOpts = {}) {}

  async launch(startUrl: string): Promise<void> {
    this.browser = await chromium.launch({
      headless: !this.opts.headed,
      args: this.opts.cdpPort ? [`--remote-debugging-port=${this.opts.cdpPort}`] : [],
    });
    this.context = await this.browser.newContext({ viewport: { width: 1100, height: 800 } });
    this.page = await this.context.newPage();
    await this.page.goto(startUrl, { waitUntil: "domcontentloaded" });
  }

  /** Attach to an already-open session — used when HITL resumes the same browser. */
  attach(page: Page, context: BrowserContext, browser: Browser): void {
    this.page = page;
    this.context = context;
    this.browser = browser;
  }

  getPage(): Page {
    if (!this.page) throw new Error("Surface not launched");
    return this.page;
  }

  async observe(): Promise<Perception> {
    const page = this.getPage();
    const title = await page.title();
    const uri = page.url();
    let snapshot = "";
    try {
      snapshot = await page.locator("body").ariaSnapshot({ timeout: 5000 });
    } catch {
      snapshot = await page.innerText("body").catch(() => "");
    }
    const tree = fromAriaSnapshotYaml(snapshot);
    const bodyText = await page.innerText("body").catch(() => "");
    return {
      surfaceKind: "web",
      title,
      uri,
      tree,
      snapshot,
      visibleText: [visibleText(tree), bodyText].filter(Boolean).join("\n"),
      dialogs: collectDialogs(tree),
    };
  }

  async act(action: ProposedAction): Promise<ActResult> {
    const page = this.getPage();
    try {
      switch (action.action) {
        case "navigate": {
          if (!action.navigateTo) return { ok: false, error: "navigate missing url" };
          await page.goto(action.navigateTo, { waitUntil: "domcontentloaded" });
          return { ok: true };
        }
        case "wait": {
          await page.waitForTimeout(action.waitMs ?? 500);
          return { ok: true };
        }
        case "press": {
          await page.keyboard.press(action.press ?? "Enter");
          return { ok: true };
        }
        case "extract": {
          if (!action.strategies?.length) {
            return { ok: false, error: "extract missing target" };
          }
          const found = await resolve(page, action.strategies);
          if ("error" in found) return { ok: false, error: found.error };
          const text = ((await found.locator.innerText().catch(() => "")) ||
            (await found.locator.inputValue().catch(() => "")))
            .trim();
          if (!action.extractAs) return { ok: false, error: "extract missing extractAs" };
          return {
            ok: true,
            extracted: { [action.extractAs]: text },
            matchedStrategy: found.strategy,
          };
        }
        case "click":
        case "dismiss":
        case "fill": {
          if (!action.strategies?.length) return { ok: false, error: `${action.action} missing target` };
          const found = await resolve(page, action.strategies);
          if ("error" in found) return { ok: false, error: found.error };
          if (action.action === "fill") {
            await found.locator.fill(action.value ?? "");
          } else {
            await found.locator.click();
          }
          await page.waitForLoadState("domcontentloaded").catch(() => undefined);
          return { ok: true, matchedStrategy: found.strategy };
        }
        case "human":
          return { ok: true };
        default:
          return { ok: false, error: `Unsupported action ${action.action}` };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async screenshot(): Promise<Buffer> {
    return this.getPage().screenshot({ type: "png", fullPage: true });
  }

  async bringToFront(): Promise<void> {
    await this.getPage().bringToFront();
  }

  async startHumanRecording(onEvent: (e: HumanAction) => void): Promise<void> {
    const page = this.getPage();
    const onNav = (frame: { url: () => string }) => {
      if (frame.url() && frame.url() !== "about:blank") {
        onEvent({ at: new Date().toISOString(), type: "navigate", detail: frame.url() });
      }
    };
    page.on("framenavigated", onNav);

    await page.exposeBinding("__hitlRecord", (_source, payload: HumanAction) => {
      onEvent(payload);
    }).catch(() => undefined);

    await page.addInitScript(() => {
      const send = (type: "click" | "fill" | "other", detail: string) => {
        const fn = (window as unknown as { __hitlRecord?: (e: unknown) => void }).__hitlRecord;
        fn?.({ at: new Date().toISOString(), type, detail });
      };
      document.addEventListener(
        "click",
        (e) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          send("click", `${t.tagName} ${t.getAttribute("title") ?? t.textContent?.trim()?.slice(0, 80) ?? ""}`);
        },
        true,
      );
      document.addEventListener(
        "change",
        (e) => {
          const t = e.target as HTMLInputElement | null;
          if (!t) return;
          send("fill", `${t.getAttribute("name") ?? t.getAttribute("title") ?? t.tagName}=***`);
        },
        true,
      );
    });

    // Current document won't get init script; bind directly.
    await page.evaluate(() => {
      const send = (type: string, detail: string) => {
        const fn = (window as unknown as { __hitlRecord?: (e: unknown) => void }).__hitlRecord;
        fn?.({ at: new Date().toISOString(), type, detail });
      };
      document.addEventListener(
        "click",
        (e) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          send("click", `${t.tagName} ${(t.getAttribute("title") ?? t.textContent ?? "").trim().slice(0, 80)}`);
        },
        true,
      );
      document.addEventListener(
        "change",
        (e) => {
          const t = e.target as HTMLInputElement | null;
          if (!t) return;
          send("fill", `${t.getAttribute("name") ?? t.getAttribute("title") ?? t.tagName}=***`);
        },
        true,
      );
    }).catch(() => undefined);

    this.recordingCleanup = async () => {
      page.off("framenavigated", onNav);
    };
  }

  async stopHumanRecording(): Promise<void> {
    await this.recordingCleanup?.();
    this.recordingCleanup = null;
  }

  async dispose(): Promise<void> {
    await this.stopHumanRecording();
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}

export async function openBrowser(startUrl: string, opts: BrowserSurfaceOpts = {}): Promise<BrowserSurface> {
  const surface = new BrowserSurface(opts);
  await surface.launch(startUrl);
  return surface;
}
