export const PIPELINE_STEPS = [
  { id: "ingest", label: "Ingest" },
  { id: "encode", label: "Encode" },
  { id: "fuse", label: "Fuse" },
  { id: "predict", label: "Predict" },
  { id: "explain", label: "Explain" },
] as const;

export type StepId = (typeof PIPELINE_STEPS)[number]["id"];
export type PlaybackMode = "ready" | "run" | "play";

export interface Timeline {
  running: boolean;
  mode: PlaybackMode;
  /** 0–4 while a step is current. 5 when the replay is at rest. */
  stepIndex: number;
  local: number;
  ingest: number;
  encode: number;
  fuse: number;
  predict: number;
  explain: number;
}

const REST: Timeline = {
  running: false,
  mode: "ready",
  stepIndex: 5,
  local: 1,
  ingest: 1,
  encode: 1,
  fuse: 1,
  predict: 1,
  explain: 1,
};

export function deriveTimeline(elapsed: number, duration: number, mode: PlaybackMode): Timeline {
  if (mode === "ready") return REST;

  const progress = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration));
  const scaled = progress * PIPELINE_STEPS.length;
  const stepIndex = Math.min(PIPELINE_STEPS.length - 1, Math.floor(scaled));
  const local = Math.min(1, scaled - stepIndex);
  const done = progress >= 1;

  const gate = (index: number) => {
    if (done || stepIndex > index) return 1;
    if (stepIndex < index) return 0;
    return local;
  };

  return {
    running: !done,
    mode,
    stepIndex: done ? 5 : stepIndex,
    local: done ? 1 : local,
    ingest: gate(0),
    encode: gate(1),
    fuse: gate(2),
    predict: gate(3),
    explain: gate(4),
  };
}

export function activeStage(timeline: Timeline): StepId | "ready" {
  if (!timeline.running) return "ready";
  return PIPELINE_STEPS[Math.min(PIPELINE_STEPS.length - 1, timeline.stepIndex)].id;
}
