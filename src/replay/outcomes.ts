import type { DetectWhen, OutcomeDetector } from "../artifact/schema.js";
import type { Perception } from "../surface/types.js";

export type Classified =
  | { hit: false }
  | { hit: true; detector: OutcomeDetector };

export function matchesWhen(when: DetectWhen, p: Perception): boolean {
  switch (when.type) {
    case "text_includes":
      return p.visibleText.includes(when.value) || p.snapshot.includes(when.value);
    case "url_includes":
      return p.uri.includes(when.value);
    case "title_includes":
      return p.title.includes(when.value);
    case "dialog":
      return p.dialogs.some((d) => d.toLowerCase().includes(when.name.toLowerCase()));
  }
}

export function classify(perception: Perception, detectors: OutcomeDetector[]): Classified {
  for (const detector of detectors) {
    if (matchesWhen(detector.when, perception)) return { hit: true, detector };
  }
  return { hit: false };
}

export function checkpointHolds(
  perception: Perception,
  anyOf: Array<
    | { type: "url_includes"; value: string }
    | { type: "title_includes"; value: string }
    | { type: "text_includes"; value: string }
    | { type: "role"; role: string; name: string }
  >,
): boolean {
  return anyOf.some((c) => {
    switch (c.type) {
      case "url_includes":
        return perception.uri.includes(c.value);
      case "title_includes":
        return perception.title.includes(c.value);
      case "text_includes":
        return perception.visibleText.includes(c.value) || perception.snapshot.includes(c.value);
      case "role":
        return perception.snapshot.toLowerCase().includes(c.role.toLowerCase()) &&
          perception.snapshot.includes(c.name);
    }
  });
}
