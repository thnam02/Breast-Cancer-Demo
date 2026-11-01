import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { attentionStats } from "../lib/attention";
import { caseAsset, type CaseFile, type TopTile } from "../types/case";

export function TileGallery({
  caseData,
  bitmap,
  visible,
}: {
  caseData: CaseFile;
  bitmap: HTMLCanvasElement | null;
  visible: boolean;
}) {
  const ranked = useMemo(() => attentionStats(caseData.tiles).ranked, [caseData]);
  const total = useMemo(() => caseData.tiles.reduce((sum, tile) => sum + Math.max(0, tile.attn), 0), [caseData]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.35 }}
      className="mt-3 min-w-0"
    >
      <p className="mb-2 font-mono text-[11px] tracking-wide text-white/50">Top-attended tiles</p>
      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        {caseData.topTiles.map((top) => {
          const index = ranked[top.rank - 1];
          const rect = index === undefined ? undefined : caseData.tiles[index];
          const share = total > 0 ? (top.attn / total) * 100 : 0;
          return (
            <TileCard
              key={`${caseData.caseId}-${top.rank}`}
              caseData={caseData}
              top={top}
              bitmap={bitmap}
              rect={rect}
              share={share}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

function TileCard({
  caseData,
  top,
  bitmap,
  rect,
  share,
}: {
  caseData: CaseFile;
  top: TopTile;
  bitmap: HTMLCanvasElement | null;
  rect?: { x: number; y: number; w: number; h: number };
  share: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (caseData.mock) {
      setPhoto(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) setPhoto(image);
    };
    image.onerror = () => {
      if (!cancelled) setPhoto(null);
    };
    image.src = caseAsset(caseData.caseId, top.img);
    return () => {
      cancelled = true;
    };
  }, [caseData, top.img]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1a1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (photo) {
      ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
    } else if (bitmap && rect) {
      ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
    }
  }, [bitmap, photo, rect]);

  return (
    <figure className="w-[84px] shrink-0">
      <div className="relative overflow-hidden rounded-[10px] border border-model/70">
        <canvas ref={canvasRef} width={160} height={160} className="h-[76px] w-[84px] bg-black" />
        <span className="absolute top-1 left-1 rounded-full bg-black/70 px-1.5 font-mono text-[10px] text-model">{top.rank}</span>
      </div>
      <figcaption className="mt-1 font-mono text-[10px] leading-tight text-white/70 tabular-nums">
        {top.attn.toFixed(4)}
        <span className="block text-white/45">{share.toFixed(1)}%</span>
      </figcaption>
    </figure>
  );
}
