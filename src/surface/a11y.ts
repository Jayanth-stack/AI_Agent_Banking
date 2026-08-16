import type { A11yNode } from "./types.js";

type Raw = {
  role?: string;
  name?: string;
  value?: string;
  children?: Raw[];
};

export function flattenSnapshot(node: A11yNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  const name = node.name ? ` "${node.name}"` : "";
  const value = node.value ? ` = ${node.value}` : "";
  const line = `${pad}- ${node.role}${name}${value}`;
  const kids = (node.children ?? []).map((c) => flattenSnapshot(c, depth + 1));
  return [line, ...kids].join("\n");
}

export function collectDialogs(node: A11yNode, acc: string[] = []): string[] {
  if (/dialog|alertdialog|alert/i.test(node.role) && node.name) acc.push(node.name);
  for (const c of node.children ?? []) collectDialogs(c, acc);
  return acc;
}

export function visibleText(node: A11yNode, acc: string[] = []): string {
  if (node.name) acc.push(node.name);
  if (node.value) acc.push(node.value);
  for (const c of node.children ?? []) visibleText(c, acc);
  return acc.join("\n");
}

export function fromAriaSnapshotYaml(yaml: string): A11yNode {
  // Playwright ariaSnapshot is YAML-ish. We keep the raw string as the model
  // input; this parse is best-effort for dialogs / text.
  const root: A11yNode = { role: "document", children: [] };
  const stack: Array<{ node: A11yNode; depth: number }> = [{ node: root, depth: -1 }];
  for (const rawLine of yaml.split("\n")) {
    const match = rawLine.match(/^(\s*)-\s+([^\s"]+)(?:\s+"([^"]*)")?(?:\s*:\s*(.*))?/);
    if (!match) continue;
    const depth = Math.floor(match[1].length / 2);
    const node: A11yNode = {
      role: match[2],
      name: match[3],
      value: match[4],
      children: [],
    };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    stack[stack.length - 1].node.children = stack[stack.length - 1].node.children ?? [];
    stack[stack.length - 1].node.children!.push(node);
    stack.push({ node, depth });
  }
  return root;
}

export function parseRaw(raw: Raw): A11yNode {
  return {
    role: raw.role ?? "unknown",
    name: raw.name,
    value: raw.value,
    children: (raw.children ?? []).map(parseRaw),
  };
}
