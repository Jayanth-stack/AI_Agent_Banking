import type { ActionKind, LocatorStrategy, RiskClass } from "../artifact/schema.js";

/** Normalized accessibility node — the perception currency for every surface. */
export type A11yNode = {
  role: string;
  name?: string;
  value?: string;
  children?: A11yNode[];
};

export type Perception = {
  surfaceKind: "web" | "desktop";
  title: string;
  uri: string;
  tree: A11yNode;
  /** Flattened role+name lines, what the model actually sees. */
  snapshot: string;
  visibleText: string;
  dialogs: string[];
};

export type ProposedAction = {
  action: ActionKind;
  description: string;
  risk: RiskClass;
  strategies?: LocatorStrategy[];
  value?: string;
  press?: string;
  extractAs?: string;
  navigateTo?: string;
  waitMs?: number;
};

export type ActResult = {
  ok: boolean;
  extracted?: Record<string, string>;
  error?: string;
  matchedStrategy?: LocatorStrategy;
};

export type HumanAction = {
  at: string;
  type: "click" | "fill" | "navigate" | "other";
  detail: string;
};

export interface ISurface {
  observe(): Promise<Perception>;
  act(action: ProposedAction): Promise<ActResult>;
  screenshot(): Promise<Buffer>;
  bringToFront(): Promise<void>;
  startHumanRecording(onEvent: (e: HumanAction) => void): Promise<void>;
  stopHumanRecording(): Promise<void>;
  dispose(): Promise<void>;
}
