import {
  AUTO_MS,
  buildTimeline,
  deriveTimeline,
  IDLE_TIMELINE,
  sceneOffset,
  SCENES,
  type PlaybackMode,
  type Timeline,
} from "./timeline";

export interface PlaybackClock {
  running: boolean;
  mode: PlaybackMode;
  started: number;
  duration: number;
  generation: number;
  presenter: boolean;
  scene: number;
  sceneStarted: number;
  predictionAt: number | null;
}

export const playbackClock: PlaybackClock = {
  running: false,
  mode: "ready",
  started: 0,
  duration: 1,
  generation: 0,
  presenter: false,
  scene: 0,
  sceneStarted: 0,
  predictionAt: null,
};

function touchPrediction(scene: number, now: number) {
  if (scene < 6) {
    playbackClock.predictionAt = null;
    return;
  }
  if (playbackClock.predictionAt == null) playbackClock.predictionAt = now;
}

export function beginPlayback(mode: Exclude<PlaybackMode, "ready">, duration = AUTO_MS) {
  const now = performance.now();
  playbackClock.mode = mode;
  playbackClock.duration = duration;
  playbackClock.started = now;
  playbackClock.running = true;
  playbackClock.generation += 1;
  playbackClock.presenter = mode === "play";
  playbackClock.scene = 0;
  playbackClock.sceneStarted = now;
  playbackClock.predictionAt = null;
}

export function endPlayback() {
  playbackClock.running = false;
  playbackClock.mode = "ready";
  playbackClock.presenter = false;
  playbackClock.predictionAt = null;
}

export function shiftScene(delta: number) {
  if (!playbackClock.running) return;
  const now = performance.now();
  if (playbackClock.presenter) {
    const next = Math.max(0, Math.min(SCENES.length - 1, playbackClock.scene + delta));
    playbackClock.scene = next;
    playbackClock.sceneStarted = now;
    armPrediction(next, now);
    return;
  }
  const timeline = readTimeline(now);
  const next = Math.max(0, Math.min(SCENES.length - 1, timeline.stepIndex + delta));
  playbackClock.started = now - sceneOffset(next);
  armPrediction(next, now);
}

function armPrediction(scene: number, now: number) {
  if (scene < 6) playbackClock.predictionAt = null;
  else if (scene > 6) playbackClock.predictionAt = now - 4200;
  else playbackClock.predictionAt = now;
}

export function readTimeline(now = performance.now()): Timeline {
  if (!playbackClock.running) return IDLE_TIMELINE;
  if (playbackClock.presenter) {
    const scene = playbackClock.scene;
    const local = Math.min(1, (now - playbackClock.sceneStarted) / SCENES[scene].ms);
    touchPrediction(scene, now);
    return buildTimeline(scene, local, "play");
  }
  const elapsed = now - playbackClock.started;
  const timeline =
    elapsed >= playbackClock.duration
      ? buildTimeline(SCENES.length - 1, 1, playbackClock.mode)
      : deriveTimeline(elapsed, playbackClock.duration, playbackClock.mode);
  touchPrediction(timeline.stepIndex, now);
  return timeline;
}
