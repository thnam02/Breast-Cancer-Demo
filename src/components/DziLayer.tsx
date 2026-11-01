import { useEffect, useRef, type MutableRefObject } from "react";
import type { AttentionStats } from "../lib/attention";
import { spectralRgb } from "../lib/colormap";
import type { Timeline } from "../lib/timeline";
import { caseAsset, type CaseFile } from "../types/case";
import type { LayerState, ViewerApi } from "../types/viewer";

export interface HoverHit {
  x: number;
  y: number;
  tileIndex: number;
}

export function DziLayer({
  caseData,
  layers,
  timeline,
  stats,
  apiRef,
  onHover,
  onMagnification,
  onFail,
}: {
  caseData: CaseFile;
  layers: LayerState;
  timeline: Timeline;
  stats: AttentionStats;
  apiRef: MutableRefObject<ViewerApi | null>;
  onHover: (hit: HoverHit | null) => void;
  onMagnification: (value: number) => void;
  onFail: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<() => void>(() => {});
  const latest = useRef({ layers, timeline, stats, onHover, onMagnification, onFail });
  latest.current = { layers, timeline, stats, onHover, onMagnification, onFail };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !caseData.slide.dzi) return;

    let cancelled = false;
    let viewer: import("openseadragon").Viewer | null = null;

    let pointerMove: ((event: PointerEvent) => void) | null = null;

    void (async () => {
      const OSD = (await import("openseadragon")).default;
      if (cancelled || !hostRef.current) return;

      pointerMove = (event: PointerEvent) => {
        if (!viewer || !hostRef.current) return;
        const rect = hostRef.current.getBoundingClientRect();
        const pixel = new OSD.Point(event.clientX - rect.left, event.clientY - rect.top);
        const image = viewer.viewport.viewportToImageCoordinates(viewer.viewport.pointFromPixel(pixel, true));
        const content = viewer.world.getItemAt(0)?.getContentSize();
        if (!content) return;
        const ix = (image.x / content.x) * caseData.slide.width;
        const iy = (image.y / content.y) * caseData.slide.height;
        const tileIndex = caseData.tiles.findIndex(
          (tile) => ix >= tile.x && ix < tile.x + tile.w && iy >= tile.y && iy < tile.y + tile.h,
        );
        latest.current.onHover(
          tileIndex >= 0 ? { x: event.clientX - rect.left, y: event.clientY - rect.top, tileIndex } : null,
        );
      };
      viewer = OSD({
        element: hostRef.current,
        tileSources: caseAsset(caseData.caseId, caseData.slide.dzi!),
        showNavigationControl: false,
        showNavigator: false,
        animationTime: 0.3,
        blendTime: 0.1,
        maxZoomPixelRatio: 2,
        visibilityRatio: 0.6,
      });

      const paint = () => {
        if (!viewer || !overlayRef.current) return;
        const canvas = overlayRef.current;
        const { layers: layerState, timeline: clock, stats: attn } = latest.current;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        if (cssW < 2 || cssH < 2) return;
        const nextW = Math.round(cssW * dpr);
        const nextH = Math.round(cssH * dpr);
        if (canvas.width !== nextW || canvas.height !== nextH) {
          canvas.width = nextW;
          canvas.height = nextH;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const item = viewer.world.getItemAt(0);
        if (!item) return;
        item.setOpacity(layerState.raw ? 1 : 0);
        const content = item.getContentSize();
        const maxAttn = Math.max(...caseData.tiles.map((tile) => tile.attn), 1e-12);
        const attentionReveal = clock.running
          ? clock.explain > 0
            ? 0.18 + clock.explain * 0.82
            : clock.encode * 0.18
          : 1;
        const showHeat = layerState.heatmap && attentionReveal > 0;
        const alpha = layerState.opacity * attentionReveal;
        const showGrid = layerState.grid || (clock.running && clock.ingest < 1);
        const showTop = layerState.top && (!clock.running || clock.explain > 0.35);
        const top = new Set(attn.ranked.slice(0, 6));

        caseData.tiles.forEach((tile, index) => {
          const p1 = viewer!.viewport.pixelFromPoint(
            viewer!.viewport.imageToViewportCoordinates((tile.x / caseData.slide.width) * content.x, (tile.y / caseData.slide.height) * content.y),
            true,
          );
          const p2 = viewer!.viewport.pixelFromPoint(
            viewer!.viewport.imageToViewportCoordinates(
              ((tile.x + tile.w) / caseData.slide.width) * content.x,
              ((tile.y + tile.h) / caseData.slide.height) * content.y,
            ),
            true,
          );
          const rect = { x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y };
          if (rect.w < 0.4 || rect.h < 0.4) return;
          if (showHeat && alpha > 0.01) {
            const t = Math.min(1, tile.attn / maxAttn);
            const [r, g, b] = spectralRgb(t);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha * (0.35 + 0.65 * t)})`;
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          }
          if (showGrid) {
            ctx.strokeStyle = "rgba(255,255,255,0.4)";
            ctx.lineWidth = 1;
            ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
          }
          if (showTop && top.has(index)) {
            ctx.strokeStyle = "#FF5A5F";
            ctx.lineWidth = 2;
            ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(0, rect.w - 2), Math.max(0, rect.h - 2));
            ctx.fillStyle = "#FF5A5F";
            ctx.font = "700 12px JetBrains Mono, monospace";
            ctx.fillText(String(attn.ranked.indexOf(index) + 1), rect.x + 4, rect.y + 14);
          }
        });

        const home = viewer.viewport.getHomeZoom() || 1;
        latest.current.onMagnification(viewer.viewport.getZoom() / home);
      };

      paintRef.current = paint;
      apiRef.current = {
        zoomIn: () => viewer?.viewport.zoomBy(1.25),
        zoomOut: () => viewer?.viewport.zoomBy(1 / 1.25),
        fit: () => viewer?.viewport.goHome(true),
      };

      viewer.addHandler("update-viewport", paint);
      viewer.addHandler("open", paint);
      viewer.addHandler("open-failed", () => latest.current.onFail());
      if (pointerMove) host.addEventListener("pointermove", pointerMove);
      host.addEventListener("pointerleave", () => latest.current.onHover(null));
    })();

    return () => {
      cancelled = true;
      paintRef.current = () => {};
      apiRef.current = null;
      if (pointerMove) host.removeEventListener("pointermove", pointerMove);
      viewer?.destroy();
      viewer = null;
    };
  }, [apiRef, caseData]);

  useEffect(() => {
    paintRef.current();
  }, [layers, stats, timeline]);

  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
