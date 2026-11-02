import { playbackClock } from "./playback";

/** Shared with the glass gauges and the receptor cards. */
export const COUNT_MS = 4200;

export function predictionProgress(now = performance.now()): number {
  if (!playbackClock.running) return 1;
  const started = playbackClock.predictionAt;
  if (started == null) return 0;
  const t = Math.min(1, Math.max(0, (now - started) / COUNT_MS));
  return 1 - (1 - t) ** 3;
}

export function shownProbability(target: number, now = performance.now()): number {
  const progress = predictionProgress(now);
  if (progress >= 1) return target;
  return target * progress;
}
