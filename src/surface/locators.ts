import type { Locator, Page } from "playwright";
import type { LocatorStrategy } from "../artifact/schema.js";

/**
 * Resolve a control by trying strategies in order.
 * Role+name first — that's the a11y tree, and it ports to desktop.
 * CSS / generated IDs are intentionally absent.
 */
export function locatorFor(page: Page, strategy: LocatorStrategy): Locator {
  switch (strategy.kind) {
    case "role": {
      const loc = page.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], {
        name: strategy.name,
        exact: strategy.exact ?? false,
      });
      return loc;
    }
    case "label":
      return page.getByLabel(strategy.text, { exact: false });
    case "placeholder":
      return page.getByPlaceholder(strategy.text, { exact: false });
    case "text": {
      const text = page.getByText(strategy.text, { exact: false });
      return strategy.role
        ? page.getByRole(strategy.role as Parameters<Page["getByRole"]>[0]).filter({ has: text })
        : text;
    }
    case "title":
      return page.locator(`[title="${cssEscape(strategy.text)}"]`);
    case "name_attr":
      return page.locator(`[name="${cssEscape(strategy.name)}"]`);
    case "near_text": {
      const cell = page.getByText(strategy.text, { exact: false });
      const scope = cell.locator("xpath=ancestor::tr[1] | ancestor::*[1]");
      if (strategy.role) {
        return scope.getByRole(strategy.role as Parameters<Page["getByRole"]>[0]).first();
      }
      return scope.locator("input, select, textarea, button").first();
    }
    case "row_cell": {
      const table = page.locator("table").filter({ has: page.getByText(strategy.columnHeader, { exact: false }) }).first();
      const row = table.locator("tr").filter({ hasText: strategy.rowText }).first();
      return row.locator("td");
    }
  }
}

async function rowCell(page: Page, strategy: Extract<LocatorStrategy, { kind: "row_cell" }>): Promise<Locator> {
  const table = page.locator("table").filter({ has: page.locator("th", { hasText: strategy.columnHeader }) }).first();
  const headers = table.locator("th");
  const n = await headers.count();
  let col = 2;
  for (let i = 0; i < n; i++) {
    const t = (await headers.nth(i).innerText()).trim();
    if (t.toLowerCase().includes(strategy.columnHeader.toLowerCase())) {
      col = i;
      break;
    }
  }
  return table.locator("tr").filter({ hasText: strategy.rowText }).first().locator("td").nth(col);
}

export async function resolve(
  page: Page,
  strategies: LocatorStrategy[],
): Promise<{ locator: Locator; strategy: LocatorStrategy } | { error: string }> {
  const tried: string[] = [];
  for (const strategy of strategies) {
    const loc = strategy.kind === "row_cell" ? await rowCell(page, strategy) : locatorFor(page, strategy).first();
    try {
      await loc.waitFor({ state: "visible", timeout: 2500 });
      return { locator: loc, strategy };
    } catch {
      tried.push(describeStrategy(strategy));
    }
  }
  return { error: `No strategy matched. Tried: ${tried.join(" | ")}` };
}

export function describeStrategy(s: LocatorStrategy): string {
  switch (s.kind) {
    case "role":
      return `role=${s.role}${s.name ? `[name="${s.name}"]` : ""}`;
    case "label":
      return `label="${s.text}"`;
    case "placeholder":
      return `placeholder="${s.text}"`;
    case "text":
      return `text="${s.text}"`;
    case "title":
      return `title="${s.text}"`;
    case "name_attr":
      return `name=${s.name}`;
    case "near_text":
      return `near("${s.text}")`;
    case "row_cell":
      return `row[${s.rowText}].${s.columnHeader}`;
  }
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function strategiesFromModel(target: {
  role?: string;
  name?: string;
  text?: string;
  title?: string;
  nameAttr?: string;
  nearText?: string;
  rowText?: string;
  columnHeader?: string;
}): LocatorStrategy[] {
  const out: LocatorStrategy[] = [];
  if (target.role) {
    out.push({ kind: "role", role: target.role, name: target.name });
  }
  if (target.name) {
    out.push({ kind: "label", text: target.name });
    out.push({ kind: "title", text: target.name });
    out.push({ kind: "placeholder", text: target.name });
  }
  if (target.title) out.push({ kind: "title", text: target.title });
  if (target.nameAttr) out.push({ kind: "name_attr", name: target.nameAttr });
  if (target.nearText) out.push({ kind: "near_text", text: target.nearText, role: target.role });
  if (target.text) out.push({ kind: "text", text: target.text, role: target.role });
  if (target.rowText && target.columnHeader) {
    out.push({ kind: "row_cell", rowText: target.rowText, columnHeader: target.columnHeader });
  }
  if (out.length === 0 && target.text) {
    out.push({ kind: "text", text: target.text });
  }
  return out;
}
