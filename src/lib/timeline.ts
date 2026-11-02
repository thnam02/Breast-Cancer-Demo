export const SCENES = [
  {
    id: "patient",
    label: "Patient",
    ms: 5000,
    kicker: "Patient",
    line: "Three views of one tumour: clinical, tissue, molecular.",
  },
  {
    id: "tiles",
    label: "Tiles",
    ms: 6000,
    kicker: "Tiling",
    line: "Slide tiled into up to 512 patches.",
  },
  {
    id: "embed",
    label: "Embed",
    ms: 6000,
    kicker: "UNI2-h",
    line: "Frozen, offline · 1536-d per tile.",
  },
  {
    id: "encoder",
    label: "Encode",
    ms: 7000,
    kicker: "WSI encoder",
    line: "Transformer MIL + gated-attention pooling → one tile-weight map, one 64-d slide token.",
  },
  {
    id: "modalities",
    label: "Modalities",
    ms: 5000,
    kicker: "Other inputs",
    line: "Clinical MLP · Gene MLP → 64-d tokens.",
  },
  {
    id: "fusion",
    label: "Fusion",
    ms: 6000,
    kicker: "Fusion",
    line: "Modality self-attention (4 heads) lets each modality read the others.",
  },
  {
    id: "predict",
    label: "Predict",
    ms: 6000,
    kicker: "Output",
    line: "Shared trunk → ER, PR (linear) · HER2 (nonlinear).",
  },
  {
    id: "explain",
    label: "Explain",
    ms: 5000,
    kicker: "Attention",
    line: "Where the WSI encoder looked: one map shared by all three receptors.",
  },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];
export type StepId = SceneId;
export type PlaybackMode = "ready" | "run" | "play";

export const AUTO_MS = SCENES.reduce((sum, scene) => sum + scene.ms, 0);

export interface Timeline {
  running: boolean;
  mode: PlaybackMode;
  /** 0–7 while a scene is current. -1 at rest. */
  stepIndex: number;
  local: number;
  ingest: number;
  encode: number;
  fuse: number;
  predict: number;
  explain: number;
}

export const IDLE_TIMELINE: Timeline = {
  running: false,
  mode: "ready",
  stepIndex: -1,
  local: 1,
  ingest: 1,
  encode: 1,
  fuse: 1,
  predict: 1,
  explain: 1,
};

const WEIGHTS = SCENES.map((scene) => scene.ms / AUTO_MS);

export function sceneOffset(index: number): number {
  let sum = 0;
  for (let i = 0; i < index && i < SCENES.length; i += 1) sum += SCENES[i].ms;
  return sum;
}

export function deriveTimeline(elapsed: number, duration: number, mode: PlaybackMode): Timeline {
  if (mode === "ready") return IDLE_TIMELINE;
  const progress = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration));
  const held = progress >= 1;
  let stepIndex = SCENES.length - 1;
  let local = 1;
  if (!held) {
    let start = 0;
    for (let index = 0; index < WEIGHTS.length; index += 1) {
      const end = start + WEIGHTS[index];
      if (progress < end || index === WEIGHTS.length - 1) {
        stepIndex = index;
        local = Math.min(1, Math.max(0, (progress - start) / WEIGHTS[index]));
        break;
      }
      start = end;
    }
  }
  return buildTimeline(stepIndex, local, mode);
}

export function buildTimeline(stepIndex: number, local: number, mode: PlaybackMode): Timeline {
  const scene = Math.max(0, Math.min(SCENES.length - 1, stepIndex));
  const t = Math.min(1, Math.max(0, local));
  const ingest = scene > 1 ? 1 : scene === 1 ? t : 0;
  const encode = scene > 3 ? 1 : scene === 2 ? t * 0.5 : scene === 3 ? 0.5 + t * 0.5 : 0;
  const fuse = scene > 5 ? 1 : scene === 5 ? t : 0;
  const predict = scene > 6 ? 1 : scene === 6 ? t : 0;
  const explain = scene === 7 ? t : 0;
  return {
    running: true,
    mode,
    stepIndex: scene,
    local: t,
    ingest,
    encode,
    fuse,
    predict,
    explain,
  };
}

export function activeStage(timeline: Timeline): StepId | "ready" {
  if (!timeline.running || timeline.stepIndex < 0) return "ready";
  return SCENES[Math.min(SCENES.length - 1, timeline.stepIndex)].id;
}
