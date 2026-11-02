import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { spectralCss } from "../../lib/colormap";
import { visualSignature } from "../../data/fidelity";
import { slideBitmap } from "../../lib/heCanvas";
import { readTimeline } from "../../lib/playback";
import { SCENES, type Timeline } from "../../lib/timeline";
import { caseAsset, type CaseFile, type Tile } from "../../types/case";
import { HudChip } from "../../components/HudChip";
import { MiniArchitecture } from "../../components/MiniArchitecture";
import { StoryCard } from "../../components/StoryCard";

const InferenceCanvas = lazy(() => import("./InferenceCanvas"));

export function useWebGLSupport(): boolean {
  const [supported] = useState(() => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      const result = Boolean(context);
      context?.getExtension("WEBGL_lose_context")?.loseContext();
      return result;
    } catch {
      return false;
    }
  });
  return supported;
}

export function InferenceStage({
  caseData,
  timeline,
  showIhc,
}: {
  caseData: CaseFile;
  timeline: Timeline;
  showIhc: boolean;
}) {
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  const [attentionHead, setAttentionHead] = useState<number | "avg">("avg");
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousSignature = useRef<Record<string, string> | null>(null);
  const side = caseData.clinical.side.toLowerCase();
  const scene = timeline.running && timeline.stepIndex >= 0 ? SCENES[timeline.stepIndex] : null;
  const patientLines = [
    `${caseData.clinical.age} y · ${caseData.clinical.sex}`,
    `${caseData.clinical.side} breast`,
    caseData.clinical.histology,
    `Stage ${caseData.clinical.stage} · ${caseData.clinical.tnm}`,
  ];
  const topTiles = useMemo(() => {
    const max = Math.max(...caseData.tiles.map((tile) => tile.attn), 1e-9);
    return caseData.tiles
      .map((tile, index) => ({ tile, index, max }))
      .sort((a, b) => b.tile.attn - a.tile.attn)
      .slice(0, 6);
  }, [caseData]);

  useEffect(() => {
    setAttentionHead("avg");
  }, [caseData.caseId]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const next = visualSignature(caseData);
    const previous = previousSignature.current;
    previousSignature.current = next;
    if (!previous) return;
    const unchanged = Object.keys(next).filter((key) => next[key] === previous[key]);
    if (unchanged.length) console.warn("[fidelity] per-patient visual did not change", caseData.caseId, unchanged.join(", "));
    else console.info("[fidelity] all per-patient visuals changed", caseData.caseId);
  }, [caseData]);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="relative h-[52vh] min-h-[360px] flex-1 min-[900px]:h-auto"
        style={{ background: "#050508" }}
        aria-label="3D inference replay"
      >
        <Suspense fallback={<CanvasFallback />}>
          <InferenceCanvas
            caseData={caseData}
            showIhc={showIhc}
            active={visible}
            attentionHead={attentionHead}
            overlayRef={overlayRef}
          />
        </Suspense>

        <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
          <svg className="absolute inset-0 h-full w-full">
            <line data-leader="0" stroke="rgba(232,232,236,0.75)" strokeWidth="1" />
            <line data-leader="1" stroke="rgba(232,232,236,0.75)" strokeWidth="1" />
          </svg>
          {[0, 1].map((index) => (
            <div key={index} data-callout={index} className="absolute top-0 left-0 w-[200px] font-medium antialiased opacity-0">
              <p data-kicker className="font-mono text-[11px] font-medium tracking-[0.16em] text-white/50 uppercase" />
              <p data-line className="mt-1 text-[13px] font-medium leading-snug text-white/88" />
              <p data-note className="mt-1 hidden font-mono text-[10px] font-medium tracking-wide text-white/45" />
            </div>
          ))}
          {(["ER", "PR", "HER2"] as const).map((receptor) => (
            <div key={receptor} data-gauge={receptor} className="absolute text-center font-medium antialiased opacity-0">
              <p data-name className="font-mono text-[11px] font-medium tracking-[0.14em] text-white/55 uppercase">{receptor}</p>
              <p data-value className="font-mono text-[12px] font-medium text-white tabular-nums" />
            </div>
          ))}
          {[192, 128, 64, 32].map((width) => (
            <div key={width} data-trunk={width} className="absolute font-mono text-[10px] font-medium tracking-wide text-white/55 antialiased opacity-0">
              {width}
            </div>
          ))}
          <div data-half className="absolute font-mono text-[10px] font-medium text-white/55 antialiased opacity-0">0.5</div>
          <p
            data-replay
            className="absolute w-max max-w-[94%] -translate-x-1/2 text-center font-mono text-[10px] font-medium tracking-wide whitespace-nowrap text-white/70 antialiased opacity-0"
          >
            Replay: precomputed model outputs, not recomputed from the inputs shown.
          </p>
        </div>

        {timeline.running && timeline.stepIndex === 5 ? (
          <div className="pointer-events-auto absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/85 px-2 py-1">
            <span className="font-mono text-[10px] tracking-wide text-white/45">Heads</span>
            {(["avg", 0, 1, 2, 3] as const).map((head) => (
              <button
                key={String(head)}
                type="button"
                onClick={() => setAttentionHead(head)}
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${attentionHead === head ? "text-white" : "text-white/45"}`}
              >
                {head === "avg" ? "avg" : head + 1}
              </button>
            ))}
          </div>
        ) : null}

        <div className="pointer-events-none absolute top-3 left-3 z-20 flex max-w-[72%] flex-wrap gap-1.5">
          <HudChip solid tone={side.startsWith("l") ? "gt" : "neutral"}>L</HudChip>
          <HudChip solid>Slide · {caseData.caseId}</HudChip>
          <HudChip solid>3D inference replay</HudChip>
        </div>
        <div className="pointer-events-none absolute top-3 right-3 z-20 flex max-w-[46%] flex-wrap justify-end gap-1.5">
          <HudChip solid><LiveK total={caseData.tiles.length} /></HudChip>
          <HudChip solid>{caseData.cohort}</HudChip>
          {caseData.mock ? <HudChip solid tone="gt">MOCK DATA</HudChip> : null}
          <HudChip solid tone={side.startsWith("r") ? "gt" : "neutral"}>R</HudChip>
        </div>

        <div className="pointer-events-none absolute top-16 left-3 z-20">
          <AnimatePresence>
            {showIhc && !timeline.running ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <StoryCard
                  tone="gt"
                  title="IHC/ISH ground truth"
                  footer={caseData.mock ? "Synthetic labels, never shown to the model." : "Loaded from the case file, never shown to the model."}
                >
                  <p>
                    ER {caseData.ihc.ER ? "Positive" : "Negative"} · PR {caseData.ihc.PR ? "Positive" : "Negative"} · HER2{" "}
                    {caseData.ihc.HER2 ? "Positive" : "Negative"}
                  </p>
                </StoryCard>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {timeline.running ? null : (
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[min(280px,72%)]">
            <StoryCard
              tone="gt"
              title={caseData.cohort === "Synthetic" || caseData.mock ? "Patient record (synthetic)" : `Patient record (${caseData.cohort})`}
              footer={caseData.mock ? "Synthetic demo record." : "Loaded from the case file."}
            >
              {patientLines.map((line) => <p key={line}>{line}</p>)}
            </StoryCard>
          </div>
        )}

        {timeline.running ? null : (
          <div className="pointer-events-none absolute right-3 bottom-3 z-20 hidden w-[190px] rounded-[14px] border border-white/10 bg-black/85 p-1.5 antialiased sm:block">
            <p className="px-1 font-mono text-[10px] tracking-wide text-white/50">Pipeline</p>
            <div className="h-[108px]"><MiniArchitecture stage="ready" /></div>
          </div>
        )}

        <AnimatePresence>
          {scene ? (
            <motion.div
              key={scene.id}
              className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-[min(560px,calc(100%-8rem))] -translate-x-1/2 rounded-[14px] border border-white/10 bg-black/85 px-4 py-2.5 text-center antialiased"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, delay: 1.05, ease: "easeOut" }}
            >
              <p className="line-clamp-2 text-[15px] leading-snug text-white/90" aria-live="polite">{scene.line}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {timeline.running && timeline.stepIndex === 7 ? (
          <motion.ol
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.15, duration: 0.45 }}
            className="pointer-events-none absolute bottom-[108px] left-1/2 z-20 grid w-[min(560px,calc(100%-2rem))] -translate-x-1/2 grid-cols-6 gap-1.5"
          >
            {topTiles.map(({ tile, max }, rank) => (
              <li key={`${tile.x}-${tile.y}`} className="rounded-[10px] border border-white/10 bg-black/85 px-1.5 py-1.5 text-center antialiased">
                <span className="mx-auto block h-1 w-8 rounded-full" style={{ background: spectralCss(tile.attn / max) }} />
                <TileStill caseData={caseData} tile={tile} rank={rank} />
                <span className="mt-1 block font-mono text-[10px] tracking-wide text-white/50">#{rank + 1}</span>
                <span className="block font-mono text-[11px] text-white tabular-nums">{tile.attn.toFixed(3)}</span>
              </li>
            ))}
          </motion.ol>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/8 px-3 py-2">
        <p className="font-mono text-[10px] text-white/45">
          {timeline.running ? "→ next · ← back · Esc stop" : "Drag to orbit · scroll to zoom"}
        </p>
        <p className="text-right font-mono text-[9px] text-white/35">
          {caseData.mock || caseData.cohort === "Synthetic"
            ? "Synthetic · procedural H&E stand-in · synthetic cases are not TCGA slides"
            : "TCGA-BRCA, NCI GDC"}
        </p>
      </div>
    </div>
  );
}

function LiveK({ total }: { total: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const timeline = readTimeline();
      const shown = !timeline.running
        ? total
        : timeline.stepIndex < 1
          ? 0
          : timeline.stepIndex === 1
            ? Math.round(timeline.ingest * total)
            : total;
      if (ref.current) ref.current.textContent = `K = ${shown}`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [total]);
  return <span ref={ref}>{`K = ${total}`}</span>;
}

function CanvasFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black">
      <p className="font-mono text-xs text-white/45">Loading 3D inference stage…</p>
    </div>
  );
}

function TileStill({ caseData, tile, rank }: { caseData: CaseFile; tile: Tile; rank: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const named = caseData.topTiles[rank]?.img;
  useEffect(() => {
    setPhoto(null);
    if (!named) return;
    const image = new Image();
    const url = caseAsset(caseData.caseId, named);
    image.onload = () => setPhoto(url);
    image.onerror = () => setPhoto(null);
    image.src = url;
  }, [caseData, named]);
  useEffect(() => {
    if (photo) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const source = slideBitmap(caseData);
    const scaleX = source.width / caseData.slide.width;
    const scaleY = source.height / caseData.slide.height;
    canvas.width = Math.max(1, Math.round(tile.w * 4));
    canvas.height = Math.max(1, Math.round(tile.h * 4));
    canvas.getContext("2d")?.drawImage(
      source,
      tile.x * scaleX,
      tile.y * scaleY,
      tile.w * scaleX,
      tile.h * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }, [caseData, photo, tile]);
  if (photo) return <img src={photo} alt="" className="mx-auto mt-1 h-8 w-full object-cover" />;
  return <canvas ref={canvasRef} className="mx-auto mt-1 h-8 w-full object-cover" />;
}
