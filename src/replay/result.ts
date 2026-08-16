export type ReplayStatus = "success" | "business_outcome" | "escalated" | "failed";

export type ReplayResult = {
  status: ReplayStatus;
  capabilityId: string;
  capabilityVersion: number;
  outputs: Record<string, string>;
  outcome?: { id: string; message: string };
  error?: {
    stepId?: string;
    expected: string;
    observed: string;
    debug?: string;
  };
  stepsCompleted: number;
  runId: string;
};

export function printResult(r: ReplayResult): void {
  const line = {
    status: r.status,
    capability: `${r.capabilityId}@${r.capabilityVersion}`,
    outputs: r.outputs,
    outcome: r.outcome,
    error: r.error,
    stepsCompleted: r.stepsCompleted,
    runId: r.runId,
  };
  console.log(JSON.stringify(line, null, 2));
}
