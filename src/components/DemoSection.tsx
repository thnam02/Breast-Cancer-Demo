import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAPER } from "../data/paper";
import { attentionStats } from "../lib/attention";
import { beginPlayback, endPlayback, playbackClock, readTimeline, shiftScene } from "../lib/playback";
import { predictionProgress } from "../lib/prediction";
import { AUTO_MS, IDLE_TIMELINE, type PlaybackMode, type Timeline } from "../lib/timeline";
import { hydrateCase } from "../data/seeded";
import { assertCaseFile, publicUrl, type CaseFile } from "../types/case";
import type { LayerState, ViewerApi } from "../types/viewer";
import { OutputPanel } from "./OutputPanel";
import { SlideViewer } from "./SlideViewer";
import { TileGallery } from "./TileGallery";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { ClinicalWorkflow } from "./ClinicalWorkflow";
import { InferenceStage, useWebGLSupport } from "../features/inference3d/InferenceStage";

const READY_LAYERS: LayerState = { raw: true, grid: false, heatmap: true, top: true, opacity: 0.72 };

export function DemoSection() {
  const [cases, setCases] = useState<CaseFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIhc, setShowIhc] = useState(false);
  const [layers, setLayers] = useState<LayerState>(READY_LAYERS);
  const [run, setRun] = useState<{ mode: Exclude<PlaybackMode, "ready">; duration: number } | null>(null);
  const [timeline, setTimeline] = useState<Timeline>(IDLE_TIMELINE);
  const [bitmap, setBitmap] = useState<HTMLCanvasElement | null>(null);
  const [predictionsRevealed, setPredictionsRevealed] = useState(false);
  const [attentionRevealed, setAttentionRevealed] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const apiRef = useRef<ViewerApi | null>(null);
  const reduced = usePrefersReducedMotion();
  const webgl = useWebGLSupport();
  const use2dFallback = reduced || !webgl;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const indexResponse = await fetch(publicUrl("cases/index.json"));
        if (!indexResponse.ok) throw new Error("Missing cases/index.json");
        const index = (await indexResponse.json()) as { cases: string[] };
        const files = await Promise.all(
          index.cases.map(async (id) => {
            const response = await fetch(publicUrl(`cases/${id}/case.json`));
            if (!response.ok) throw new Error(`Missing case.json for ${id}`);
            return hydrateCase(assertCaseFile(await response.json()));
          }),
        );
        if (cancelled) return;
        setCases(files);
        setActiveId(files[0]?.caseId ?? null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load cases");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!run) return;
    beginPlayback(run.mode, run.duration);
    let frame = 0;
    let stopped = false;
    const publish = (next: Timeline) => {
      setTimeline(next);
      if (!next.running) return;
      setPredictionsRevealed(next.stepIndex >= 6);
      setAttentionRevealed(next.stepIndex >= 5);
    };
    const initial = readTimeline();
    let lastStep = initial.stepIndex;
    let lastHeld = false;
    publish(initial);
    const tick = () => {
      const next = readTimeline();
      if (!next.running) {
        stopped = true;
        endPlayback();
        setTimeline(IDLE_TIMELINE);
        setRun(null);
        return;
      }
      const held = next.mode === "run" && next.stepIndex === 7 && next.local >= 1;
      if (next.stepIndex !== lastStep || held !== lastHeld) {
        lastHeld = held;
        lastStep = next.stepIndex;
        publish(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (!stopped) endPlayback();
    };
  }, [run]);

  const caseData = cases.find((item) => item.caseId === activeId) ?? null;
  const stats = useMemo(() => (caseData ? attentionStats(caseData.tiles) : null), [caseData]);

  const onBitmap = useCallback((canvas: HTMLCanvasElement | null) => {
    setBitmap(canvas);
  }, []);

  const start = useCallback((mode: "run" | "play") => {
    setPredictionsRevealed(false);
    setAttentionRevealed(false);
    setRun({ mode, duration: AUTO_MS });
  }, []);

  const stop = useCallback(() => {
    const scene = playbackClock.running ? readTimeline().stepIndex : -1;
    const settled = playbackClock.predictionAt != null && predictionProgress() >= 1;
    endPlayback();
    setRun(null);
    setTimeline(IDLE_TIMELINE);
    setPredictionsRevealed(settled);
    setAttentionRevealed(scene >= 5);
  }, []);

  const nudge = useCallback((delta: number) => {
    if (!playbackClock.running) return;
    shiftScene(delta);
    const next = readTimeline();
    setTimeline(next);
    setPredictionsRevealed(next.running && next.stepIndex >= 6);
    setAttentionRevealed(next.running && next.stepIndex >= 5);
  }, []);

  const selectCase = useCallback((id: string) => {
    endPlayback();
    setRun(null);
    setTimeline(IDLE_TIMELINE);
    setBitmap(null);
    setPredictionsRevealed(false);
    setAttentionRevealed(false);
    setActiveId(id);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.key === "f" || event.key === "F") {
        const next = !presentation;
        setPresentation(next);
        if (next) {
          void document.documentElement.requestFullscreen?.().catch(() => undefined);
        } else if (document.fullscreenElement) {
          void document.exitFullscreen?.().catch(() => undefined);
        }
        return;
      }
      if (event.key === "Escape") {
        if (playbackClock.running) stop();
        return;
      }
      const typing = target?.closest("input, textarea, select");
      if (typing) return;
      if (event.key === "ArrowRight" || event.code === "Space") {
        event.preventDefault();
        if (playbackClock.running) nudge(1);
        else if (event.code === "Space") start("run");
        return;
      }
      if (event.key === "ArrowLeft") {
        if (!playbackClock.running) return;
        event.preventDefault();
        nudge(-1);
        return;
      }
      if (target?.closest("button, a, [role='button']")) return;
      if (event.key === "i" || event.key === "I") {
        setShowIhc((value) => !value);
      } else if (event.key === "h" || event.key === "H") {
        setLayers((value) => ({ ...value, heatmap: !value.heatmap }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge, presentation, start, stop]);

  return (
    <section id="demo" className="mx-auto w-full max-w-[1680px] px-3 pt-3 pb-6 sm:px-5" aria-busy={timeline.running}>
      {error ? (
        <p className="panel p-6 text-sm text-model">{error}</p>
      ) : !caseData || !stats ? (
        <p className="panel p-6 font-mono text-sm text-white/60">Loading case files…</p>
      ) : (
        <>
          <div
            className={
              presentation
                ? "fixed inset-0 z-[100] grid min-w-0 items-stretch gap-3 bg-bg p-3 min-[900px]:grid-cols-[minmax(0,1fr)_340px]"
                : "grid min-w-0 items-stretch gap-3 min-[900px]:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)] min-[900px]:h-[calc(100vh-7.4rem)] min-[900px]:min-h-[680px]"
            }
          >
            <div className="flex min-w-0 flex-col min-[900px]:h-full min-[900px]:min-h-0">
              {use2dFallback ? (
                <>
                  <SlideViewer
                    caseData={caseData}
                    layers={layers}
                    onLayers={(patch) => setLayers((value) => ({ ...value, ...patch }))}
                    timeline={timeline}
                    showIhc={showIhc}
                    apiRef={apiRef}
                    onBitmap={onBitmap}
                  />
                  <AnimatePresence>
                    {(!timeline.running || timeline.explain > 0.2) && (
                      <TileGallery caseData={caseData} bitmap={bitmap} visible />
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <InferenceStage caseData={caseData} timeline={timeline} showIhc={showIhc} />
              )}
            </div>
            <OutputPanel
              cases={cases}
              activeId={caseData.caseId}
              onSelect={selectCase}
              caseData={caseData}
              timeline={timeline}
              showIhc={showIhc}
              onToggleIhc={() => setShowIhc((value) => !value)}
              onRun={() => start("run")}
              onPlay={() => start("play")}
              predictionsRevealed={predictionsRevealed}
              attentionRevealed={attentionRevealed}
              presentation={presentation}
              stats={stats}
            />
          </div>
          {!presentation ? (
            <>
              <ClinicalWorkflow caseData={caseData} showIhc={showIhc} />
              <p className="mt-3 font-mono text-[11px] tracking-wide text-white/45">
                {caseData.cohort} · {caseData.caseId} · {PAPER.citation} · Research prototype, not for clinical use
              </p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
