import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { attentionStats, shareOfAttention } from "../lib/attention";
import { SPECTRAL_GRADIENT, spectralRgb } from "../lib/colormap";
import { paintSyntheticSlide } from "../lib/heCanvas";
import { activeStage, type Timeline } from "../lib/timeline";
import { caseAsset, type CaseFile } from "../types/case";
import type { LayerState, ViewerApi } from "../types/viewer";
import { DziLayer, type HoverHit } from "./DziLayer";
import { HudChip } from "./HudChip";
import { MiniArchitecture } from "./MiniArchitecture";
import { StoryCard } from "./StoryCard";

interface View {
  x: number;
  y: number;
  scale: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function SlideViewer({
  caseData,
  layers,
  onLayers,
  timeline,
  showIhc,
  apiRef,
  onBitmap,
}: {
  caseData: CaseFile;
  layers: LayerState;
  onLayers: (patch: Partial<LayerState>) => void;
  timeline: Timeline;
  showIhc: boolean;
  apiRef: MutableRefObject<ViewerApi | null>;
  onBitmap: (bitmap: HTMLCanvasElement | null) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 });
  const movedRef = useRef(false);
  const [view, setView] = useState<View>(viewRef.current);
  const [fitScale, setFitScale] = useState(1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [painted, setPainted] = useState(0);
  const [hover, setHover] = useState<HoverHit | null>(null);
  const [dziFailed, setDziFailed] = useState(false);
  const [magnification, setMagnification] = useState(1);

  const useDzi = Boolean(caseData.slide.dzi) && !dziFailed;
  const stats = useMemo(() => attentionStats(caseData.tiles), [caseData]);
  const sweepOrder = useMemo(
    () =>
      caseData.tiles
        .map((tile, index) => ({ tile, index }))
        .sort((a, b) => a.tile.x - b.tile.x || a.tile.y - b.tile.y),
    [caseData],
  );
  const flightTiles = useMemo(() => {
    const ranked = [...caseData.tiles].sort((a, b) => b.attn - a.attn).slice(0, 24);
    return ranked.filter((_, index) => index % 2 === 0).slice(0, 12);
  }, [caseData]);

  const commitView = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const fitView = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const scale = Math.min(rect.width / caseData.slide.width, rect.height / caseData.slide.height) || 1;
    const next = {
      scale,
      x: (rect.width - caseData.slide.width * scale) / 2,
      y: (rect.height - caseData.slide.height * scale) / 2,
    };
    commitView(next);
    setFitScale(scale);
    setSize((prev) => (prev.w === rect.width && prev.h === rect.height ? prev : { w: rect.width, h: rect.height }));
  }, [caseData.slide.height, caseData.slide.width, commitView]);

  const zoomBy = useCallback(
    (factor: number) => {
      const current = viewRef.current;
      const cx = size.w / 2;
      const cy = size.h / 2;
      const nextScale = clamp(current.scale * factor, fitScale * 0.85, fitScale * 14);
      const ix = (cx - current.x) / current.scale;
      const iy = (cy - current.y) / current.scale;
      movedRef.current = true;
      commitView({ scale: nextScale, x: cx - ix * nextScale, y: cy - iy * nextScale });
    },
    [commitView, fitScale, size.h, size.w],
  );

  useEffect(() => {
    setDziFailed(false);
    setHover(null);
    movedRef.current = false;
  }, [caseData.caseId]);

  useEffect(() => {
    if (useDzi) {
      return;
    }
    apiRef.current = {
      zoomIn: () => zoomBy(1.25),
      zoomOut: () => zoomBy(1 / 1.25),
      fit: () => {
        movedRef.current = false;
        fitView();
      },
    };
    return () => {
      if (!useDzi) apiRef.current = null;
    };
  }, [apiRef, fitView, useDzi, zoomBy]);

  useEffect(() => {
    let cancelled = false;
    const cache = document.createElement("canvas");
    cache.width = caseData.slide.width;
    cache.height = caseData.slide.height;
    const ctx = cache.getContext("2d");
    if (!ctx) return;

    const finish = () => {
      if (cancelled) return;
      heRef.current = cache;
      onBitmap(cache);
      setPainted((value) => value + 1);
    };

    if (caseData.mock) {
      paintSyntheticSlide(ctx, caseData);
      finish();
      return () => {
        cancelled = true;
      };
    }

    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0, cache.width, cache.height);
      finish();
    };
    image.onerror = () => {
      paintSyntheticSlide(ctx, caseData);
      finish();
    };
    image.src = caseAsset(caseData.caseId, caseData.slide.thumb);
    return () => {
      cancelled = true;
    };
  }, [caseData, onBitmap]);

  useEffect(() => {
    movedRef.current = false;
    fitView();
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => {
      if (movedRef.current) {
        const rect = frame.getBoundingClientRect();
        setSize((prev) => (prev.w === rect.width && prev.h === rect.height ? prev : { w: rect.width, h: rect.height }));
      } else {
        fitView();
      }
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fitView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || useDzi) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const current = viewRef.current;
      const nextScale = clamp(current.scale * (event.deltaY > 0 ? 0.92 : 1.08), fitScale * 0.85, fitScale * 14);
      const ix = (mx - current.x) / current.scale;
      const iy = (my - current.y) / current.scale;
      movedRef.current = true;
      commitView({ scale: nextScale, x: mx - ix * nextScale, y: my - iy * nextScale });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [commitView, fitScale, useDzi]);

  useLayoutEffect(() => {
    if (useDzi) return;
    const canvas = canvasRef.current;
    const bitmap = heRef.current;
    if (!canvas || !bitmap || size.w < 2 || size.h < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextW = Math.round(size.w * dpr);
    const nextH = Math.round(size.h * dpr);
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size.w, size.h);

    const { x, y, scale } = view;
    ctx.save();
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * x, dpr * y);
    if (layers.raw) {
      const dim =
        timeline.running && timeline.encode > 0 && timeline.encode < 1
          ? 1 - 0.28 * Math.sin(timeline.encode * Math.PI)
          : 1;
      ctx.globalAlpha = dim;
      ctx.drawImage(bitmap, 0, 0);
      ctx.globalAlpha = 1;
    }

    const maxAttn = Math.max(...caseData.tiles.map((tile) => tile.attn), 1e-12);
    const revealCount =
      timeline.running && timeline.ingest < 1 ? Math.round(timeline.ingest * sweepOrder.length) : sweepOrder.length;
    const revealed = new Set(sweepOrder.slice(0, revealCount).map((item) => item.index));
    const showGrid = layers.grid || (timeline.running && timeline.ingest < 1);
    const attentionReveal = timeline.running
      ? timeline.explain > 0
        ? 0.18 + timeline.explain * 0.82
        : timeline.encode * 0.18
      : 1;
    const showHeat = layers.heatmap && attentionReveal > 0;
    const heatAlpha = layers.opacity * attentionReveal;
    const showTop = layers.top && (!timeline.running || timeline.explain > 0.35);

    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.38)";
      ctx.lineWidth = 1 / scale;
      for (const item of sweepOrder) {
        if (!revealed.has(item.index)) continue;
        ctx.strokeRect(item.tile.x, item.tile.y, item.tile.w, item.tile.h);
      }
      if (timeline.running && timeline.ingest < 1 && revealCount > 0) {
        const frontier = sweepOrder[Math.min(sweepOrder.length - 1, revealCount - 1)];
        ctx.strokeStyle = "rgba(255,95,162,0.95)";
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        ctx.moveTo(frontier.tile.x, 0);
        ctx.lineTo(frontier.tile.x, caseData.slide.height);
        ctx.stroke();
      }
    }

    if (showHeat && heatAlpha > 0.01) {
      for (const tile of caseData.tiles) {
        const t = Math.min(1, tile.attn / maxAttn);
        const [r, g, b] = spectralRgb(t);
        ctx.fillStyle = `rgba(${r},${g},${b},${heatAlpha * (0.35 + 0.65 * t)})`;
        ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
      }
    }

    if (showTop) {
      ctx.save();
      ctx.shadowColor = "#FF5A5F";
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2.5 / scale;
      ctx.strokeStyle = "#FF5A5F";
      ctx.fillStyle = "#FF5A5F";
      ctx.font = `700 ${13 / scale}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textBaseline = "top";
      stats.ranked.slice(0, 6).forEach((index, order) => {
        const tile = caseData.tiles[index];
        ctx.strokeRect(tile.x, tile.y, tile.w, tile.h);
        ctx.shadowBlur = 0;
        ctx.fillText(String(order + 1), tile.x + 4 / scale, tile.y + 3 / scale);
        ctx.shadowBlur = 14;
      });
      ctx.restore();
    }
    ctx.restore();
  }, [caseData, hover, layers, painted, size.h, size.w, stats, sweepOrder, timeline, useDzi, view]);

  const hitTest = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const current = viewRef.current;
    const ix = (mx - current.x) / current.scale;
    const iy = (my - current.y) / current.scale;
    const tileIndex = caseData.tiles.findIndex(
      (tile) => ix >= tile.x && ix < tile.x + tile.w && iy >= tile.y && iy < tile.y + tile.h,
    );
    setHover(tileIndex >= 0 ? { x: mx, y: my, tileIndex } : null);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      vx: viewRef.current.x,
      vy: viewRef.current.y,
      moved: false,
    };
  };

  const dragRef = useRef<{ id: number; x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; scale: number; x: number; y: number; midX: number; midY: number } | null>(null);

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const rect = event.currentTarget.getBoundingClientRect();
      const midX = (a.x + b.x) / 2 - rect.left;
      const midY = (a.y + b.y) / 2 - rect.top;
      if (!pinchRef.current) {
        pinchRef.current = {
          dist,
          scale: viewRef.current.scale,
          x: viewRef.current.x,
          y: viewRef.current.y,
          midX,
          midY,
        };
      }
      const start = pinchRef.current;
      const nextScale = clamp(start.scale * (dist / start.dist), fitScale * 0.85, fitScale * 14);
      const ix = (start.midX - start.x) / start.scale;
      const iy = (start.midY - start.y) / start.scale;
      movedRef.current = true;
      commitView({ scale: nextScale, x: midX - ix * nextScale, y: midY - iy * nextScale });
      setHover(null);
      return;
    }
    const drag = dragRef.current;
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      if (drag.moved) {
        movedRef.current = true;
        commitView({ ...viewRef.current, x: drag.vx + dx, y: drag.vy + dy });
        setHover(null);
        return;
      }
    }
    hitTest(event.clientX, event.clientY);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  };

  const kShown =
    timeline.running && timeline.ingest < 1 ? Math.round(timeline.ingest * caseData.tiles.length) : caseData.tiles.length;
  const mag = useDzi ? magnification : fitScale > 0 ? view.scale / fitScale : 1;
  const side = caseData.clinical.side.toLowerCase();
  const patientLines = [
    `${caseData.clinical.age} y · ${caseData.clinical.sex}`,
    `${caseData.clinical.side} breast`,
    caseData.clinical.histology,
    `Stage ${caseData.clinical.stage} · ${caseData.clinical.tnm}`,
  ];
  const visiblePatientLines =
    !timeline.running || timeline.ingest >= 1
      ? patientLines.length
      : Math.max(1, Math.ceil(timeline.ingest * patientLines.length));
  const hovered = hover ? caseData.tiles[hover.tileIndex] : null;
  const hoveredRank = hover ? stats.ranked.indexOf(hover.tileIndex) + 1 : 0;
  const flying = !useDzi && timeline.running && timeline.encode > 0 && timeline.encode < 1;
  const stage = activeStage(timeline);

  const pipCenter = () => {
    const frame = frameRef.current?.getBoundingClientRect();
    const pip = document.getElementById("pipeline-pip")?.getBoundingClientRect();
    if (!frame || !pip) return { x: size.w * 0.82, y: size.h * 0.72 };
    return { x: pip.left - frame.left + pip.width * 0.78, y: pip.top - frame.top + pip.height * 0.42 };
  };
  const dest = flying ? pipCenter() : null;
  const ease = flying ? (timeline.encode < 0.5 ? 2 * timeline.encode ** 2 : 1 - (-2 * timeline.encode + 2) ** 2 / 2) : 0;

  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={frameRef} className="relative h-[42vh] min-h-[260px] flex-1 bg-black min-[900px]:h-auto">
        {useDzi ? (
          <DziLayer
            caseData={caseData}
            layers={layers}
            timeline={timeline}
            stats={stats}
            apiRef={apiRef}
            onHover={setHover}
            onMagnification={setMagnification}
            onFail={() => setDziFailed(true)}
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => {
              movedRef.current = false;
              fitView();
            }}
            aria-label={`Whole-slide thumbnail for ${caseData.caseId}`}
          />
        )}

        {flying && dest
          ? flightTiles.map((tile, index) => {
              const sx = view.x + (tile.x + tile.w / 2) * view.scale;
              const sy = view.y + (tile.y + tile.h / 2) * view.scale;
              return (
                <span
                  key={`${tile.x}-${tile.y}-${index}`}
                  className="pointer-events-none absolute z-20 h-2.5 w-2.5 rounded-full bg-wsi shadow-[0_0_12px_#FF5FA2]"
                  style={{
                    left: sx + (dest.x - sx) * ease,
                    top: sy + (dest.y - sy) * ease,
                    transform: `translate(-50%, -50%) scale(${1 - ease * 0.7})`,
                  }}
                />
              );
            })
          : null}

        <div className="pointer-events-none absolute top-3 left-3 z-20 flex max-w-[70%] flex-wrap gap-1.5">
          <HudChip tone={side.startsWith("l") ? "gt" : "neutral"} title="Slide orientation">
            L
          </HudChip>
          <HudChip>Slide · {caseData.caseId}</HudChip>
          <HudChip title="Display magnification relative to the fitted view">Mag · {mag.toFixed(1)}×</HudChip>
        </div>
        <div className="pointer-events-none absolute top-3 right-3 z-20 flex max-w-[55%] flex-wrap justify-end gap-1.5">
          <HudChip>K = {kShown} tiles</HudChip>
          {caseData.mock ? <HudChip tone="gt">MOCK DATA</HudChip> : null}
          <HudChip tone={side.startsWith("r") ? "gt" : "neutral"} title="Slide orientation">
            R
          </HudChip>
        </div>

        <div className="absolute top-14 left-3 z-20">
          <AnimatePresence>
            {showIhc ? (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <StoryCard
                  tone="gt"
                  title="IHC/ISH ground truth"
                  footer={
                    caseData.mock
                      ? "Synthetic labels in this demo file, never shown to the model."
                      : "Loaded from TCGA, never shown to the model."
                  }
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

        <div className="absolute bottom-3 left-3 z-20 max-w-[min(280px,70%)]">
          <StoryCard
            tone="gt"
            title="Patient record (TCGA)"
            footer={caseData.mock ? "Synthetic demo record." : "Loaded from the case file."}
          >
            {patientLines.slice(0, visiblePatientLines).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </StoryCard>
        </div>

        <div
          id="pipeline-pip"
          className="pointer-events-none absolute right-3 bottom-3 z-20 w-[168px] rounded-[14px] border border-white/10 bg-black/60 p-1.5 backdrop-blur-md min-[900px]:w-[210px]"
        >
          <p className="px-1 font-mono text-[10px] tracking-wide text-white/50">Pipeline</p>
          <div className="h-[118px]">
            <MiniArchitecture stage={stage} />
          </div>
        </div>

        {hovered && hover ? (
          <div
            className="pointer-events-none absolute z-30 max-w-[200px] rounded-[10px] border border-white/10 bg-black/75 px-2.5 py-2 font-mono text-[11px] text-white backdrop-blur-md"
            style={{
              left: Math.min(hover.x + 12, Math.max(8, size.w - 180)),
              top: Math.max(8, hover.y - 72),
            }}
          >
            <p className="text-model">Rank {hoveredRank}</p>
            <p className="mt-1 tabular-nums">attn {hovered.attn.toFixed(4)}</p>
            <p className="text-white/70 tabular-nums">{shareOfAttention(hovered.attn, stats.total).toFixed(2)}% of total attention</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/8 px-2.5 py-2">
        {(
          [
            ["raw", "Raw"],
            ["grid", "Grid"],
            ["heatmap", "Heat"],
            ["top", "Top"],
          ] as const
        ).map(([key, label]) => {
          const pressed = layers[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={pressed}
              title={key === "heatmap" ? "H" : undefined}
              onClick={() => onLayers({ [key]: !pressed })}
              className={`rounded-full border px-3 py-1 font-mono text-[11px] ${
                pressed ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/55 hover:text-white"
              }`}
            >
              {label}
            </button>
          );
        })}
        <span className="font-mono text-[9px] text-white/40">One WSI tile-attention map · shared by ER/PR/HER2</span>
        <label className="ml-auto flex items-center gap-2 font-mono text-[11px] text-white/55">
          Opacity
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={layers.opacity}
            aria-label="Heatmap opacity"
            onChange={(event) => onLayers({ opacity: Number(event.target.value) })}
            className="w-20 accent-[#FF5A5F]"
          />
          <span className="h-2 w-12 rounded-full" style={{ background: SPECTRAL_GRADIENT }} aria-hidden />
        </label>
        <button type="button" className="rounded-full border border-white/10 px-2 py-1 font-mono text-[12px] text-white/80 hover:bg-white/10" onClick={() => apiRef.current?.zoomOut()}>
          −
        </button>
        <button type="button" className="rounded-full border border-white/10 px-2 py-1 font-mono text-[12px] text-white/80 hover:bg-white/10" onClick={() => apiRef.current?.zoomIn()}>
          +
        </button>
        <button type="button" className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-white/80 hover:bg-white/10" onClick={() => apiRef.current?.fit()}>
          Fit
        </button>
      </div>
    </div>
  );
}
