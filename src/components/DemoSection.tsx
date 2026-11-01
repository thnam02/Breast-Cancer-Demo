import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAPER } from "../data/paper";
import { attentionStats } from "../lib/attention";
import { deriveTimeline, type PlaybackMode } from "../lib/timeline";
import { assertCaseFile, type CaseFile } from "../types/case";
import type { LayerState, ViewerApi } from "../types/viewer";
import { OutputPanel } from "./OutputPanel";
import { SlideViewer } from "./SlideViewer";
import { TileGallery } from "./TileGallery";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { ClinicalWorkflow } from "./ClinicalWorkflow";

const READY_LAYERS: LayerState = { raw: true, grid: false, heatmap: true, top: true, opacity: 0.72 };

export function DemoSection() {
  const [cases, setCases] = useState<CaseFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIhc, setShowIhc] = useState(false);
  const [layers, setLayers] = useState<LayerState>(READY_LAYERS);
  const [run, setRun] = useState<{ mode: Exclude<PlaybackMode, "ready">; started: number; duration: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [bitmap, setBitmap] = useState<HTMLCanvasElement | null>(null);
  const apiRef = useRef<ViewerApi | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const indexResponse = await fetch("/cases/index.json");
        if (!indexResponse.ok) throw new Error("Missing /cases/index.json");
        const index = (await indexResponse.json()) as { cases: string[] };
        const files = await Promise.all(
          index.cases.map(async (id) => {
            const response = await fetch(`/cases/${id}/case.json`);
            if (!response.ok) throw new Error(`Missing case.json for ${id}`);
            return assertCaseFile(await response.json());
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
    let frame = 0;
    const tick = (now: number) => {
      const next = now - run.started;
      setElapsed(next);
      if (next < run.duration) frame = requestAnimationFrame(tick);
      else setRun(null);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run]);

  const caseData = cases.find((item) => item.caseId === activeId) ?? null;
  const timeline = useMemo(
    () => deriveTimeline(run ? elapsed : 0, run?.duration ?? 1, run ? run.mode : "ready"),
    [elapsed, run],
  );
  const stats = useMemo(() => (caseData ? attentionStats(caseData.tiles) : null), [caseData]);

  const onBitmap = useCallback((canvas: HTMLCanvasElement | null) => {
    setBitmap(canvas);
  }, []);

  const start = useCallback(
    (mode: "run" | "play") => {
      if (reduced && mode === "run") {
        setRun(null);
        setElapsed(0);
        return;
      }
      const duration = reduced ? 9000 : mode === "play" ? 16000 : 8000;
      setElapsed(0);
      setRun({ mode, started: performance.now(), duration });
    },
    [reduced],
  );

  const selectCase = useCallback((id: string) => {
    setRun(null);
    setElapsed(0);
    setBitmap(null);
    setActiveId(id);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, [role='button']")) return;
      if (event.code === "Space") {
        event.preventDefault();
        start("run");
      } else if (event.key === "i" || event.key === "I") {
        setShowIhc((value) => !value);
      } else if (event.key === "h" || event.key === "H") {
        setLayers((value) => ({ ...value, heatmap: !value.heatmap }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start]);

  return (
    <section id="demo" className="mx-auto w-full max-w-[1680px] px-3 pt-3 pb-6 sm:px-5" aria-busy={timeline.running}>
      {error ? (
        <p className="panel p-6 text-sm text-model">{error}</p>
      ) : !caseData || !stats ? (
        <p className="panel p-6 font-mono text-sm text-white/60">Loading case files…</p>
      ) : (
        <>
          <div className="grid min-w-0 items-stretch gap-3 min-[900px]:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)] min-[900px]:h-[calc(100vh-7.4rem)] min-[900px]:min-h-[680px]">
            <div className="flex min-w-0 flex-col min-[900px]:h-full min-[900px]:min-h-0">
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
              stats={stats}
            />
          </div>
          <ClinicalWorkflow caseData={caseData} showIhc={showIhc} />
          <p className="mt-3 font-mono text-[11px] tracking-wide text-white/45">
            {caseData.cohort} · {caseData.caseId} · {PAPER.citation} · Research prototype, not for clinical use
          </p>
        </>
      )}
    </section>
  );
}
