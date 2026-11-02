import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { THRESHOLD } from "../config/model";
import type { AttentionStats } from "../lib/attention";
import { SCENES, type Timeline } from "../lib/timeline";
import type { CaseFile, Receptor } from "../types/case";
import { MetricCard } from "./MetricCard";
import { Stepper } from "./Stepper";

const RECEPTORS: Receptor[] = ["ER", "PR", "HER2"];
const MODALITY = [
  { key: "Clinical", color: "#E8B04B" },
  { key: "Gene", color: "#4FD1A5" },
  { key: "WSI", color: "#E86A92" },
] as const;

export function OutputPanel({
  cases,
  activeId,
  onSelect,
  caseData,
  timeline,
  showIhc,
  onToggleIhc,
  onRun,
  onPlay,
  predictionsRevealed,
  attentionRevealed,
  presentation,
  stats,
}: {
  cases: CaseFile[];
  activeId: string;
  onSelect: (id: string) => void;
  caseData: CaseFile;
  timeline: Timeline;
  showIhc: boolean;
  onToggleIhc: () => void;
  onRun: () => void;
  onPlay: () => void;
  predictionsRevealed: boolean;
  attentionRevealed: boolean;
  presentation: boolean;
  stats: AttentionStats;
}) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const running = timeline.running;
  const matrixOk = caseData.modalityAttention.length === 3 && caseData.modalityAttention.every((row) => row.length === 3);
  const holding = running && timeline.mode === "run" && timeline.stepIndex === SCENES.length - 1 && timeline.local >= 1;

  useEffect(() => {
    setDetailsOpen(!running);
  }, [running]);

  const genes = <GeneBars caseData={caseData} />;
  const matrix = attentionRevealed && matrixOk ? <AttentionMatrix caseData={caseData} /> : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3 min-[900px]:h-full min-[900px]:overflow-y-auto min-[900px]:pr-1">
      {!presentation ? (
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {cases.map((item) => {
            const selected = item.caseId === activeId;
            return (
              <button
                key={item.caseId}
                type="button"
                onClick={() => onSelect(item.caseId)}
                aria-pressed={selected}
                className={`min-w-[148px] rounded-[14px] border px-3 py-2 text-left ${
                  selected ? "border-model bg-model/10" : "border-white/10 bg-black/25 hover:border-white/30"
                }`}
              >
                <span className="block font-mono text-[12px] text-white">{item.caseId}</span>
                <span className="mt-1 block font-mono text-[10px] text-white/45">{item.descriptor ?? caseDescriptor(item)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Stepper activeIndex={running ? timeline.stepIndex : -1} />

      <div className="grid grid-cols-3 gap-2">
        {RECEPTORS.map((receptor) => (
          <MetricCard
            key={`${caseData.caseId}-${receptor}`}
            receptor={receptor}
            probability={caseData.pred[receptor]}
            hidden={!predictionsRevealed}
            showIhc={showIhc}
            ihc={caseData.ihc[receptor]}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] tracking-wide text-white/40">Call appears after the count, if the final probability ≥ {THRESHOLD.toFixed(1)}</p>

      <details
        className="rounded-[14px] border border-white/10 bg-black/25 px-3 py-2"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer font-mono text-[11px] tracking-[0.14em] text-white/55 uppercase">Details</summary>
        <div className="mt-3 space-y-4">
          {genes}
          {matrix}
        </div>
      </details>

      {!presentation && !running && attentionRevealed ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Top-100 mass" value={`${(stats.top100 * 100).toFixed(1)}%`} title="Share of attention held by the 100 heaviest tiles" />
          <Stat label="Entropy" value={`${stats.entropy.toFixed(2)} nats`} title="Shannon entropy of the tile weights, in nats" />
        </div>
      ) : null}

      <div className="space-y-2 min-[900px]:sticky min-[900px]:bottom-0 min-[900px]:z-10 min-[900px]:bg-gradient-to-t min-[900px]:from-bg min-[900px]:from-70% min-[900px]:to-transparent min-[900px]:pt-3 min-[900px]:pb-1">
        <button
          type="button"
          onClick={onRun}
          className="h-11 w-full rounded-[14px] border border-ok bg-ok/10 font-mono text-[13px] tracking-wide text-ok hover:bg-ok/20"
        >
          {holding ? "Holding · Esc stops" : running && timeline.mode === "run" ? "Replaying…" : "Run inference"}
        </button>
        <button
          type="button"
          onClick={onToggleIhc}
          aria-pressed={showIhc}
          title="I"
          className={`h-11 w-full rounded-[14px] border font-mono text-[13px] tracking-wide ${
            showIhc ? "border-gt bg-gt/15 text-gt" : "border-gt/70 text-gt hover:bg-gt/10"
          }`}
        >
          Show IHC
        </button>
        <button
          type="button"
          onClick={onPlay}
          className="h-11 w-full rounded-[14px] border border-white/25 font-mono text-[13px] tracking-wide text-white hover:bg-white/10"
        >
          {running && timeline.mode === "play" ? "Presenter · waiting" : "Play pipeline"}
        </button>
        <p className="text-center font-mono text-[10px] text-white/35">→ / Space next · ← back · Esc stop · I IHC</p>
      </div>
    </div>
  );
}

function caseDescriptor(item: CaseFile): string {
  const match = item.caseId.match(/(\d+)$/);
  if (item.mock && match) return `Synthetic case ${Number(match[1])}`;
  return item.cohort;
}

function GeneBars({ caseData }: { caseData: CaseFile }) {
  const maxAbs = Math.max(...caseData.genes.map((gene) => Math.abs(gene.z)), 1);
  return (
    <div>
      <p className="mb-1.5 font-mono text-[11px] tracking-wide text-gene">
        Gene expression z-scores · patient input{caseData.mock ? " · synthetic" : ""}
      </p>
      <div className="space-y-1">
        {caseData.genes.map((gene) => {
          const width = (Math.abs(gene.z) / maxAbs) * 50;
          const left = gene.z >= 0 ? 50 : 50 - width;
          return (
            <div key={`${gene.receptor}-${gene.symbol}`} className="grid grid-cols-[64px_1fr_36px] items-center gap-2">
              <span className="font-mono text-[10px] text-white/80">
                {gene.symbol}
                <span className="ml-1 text-white/35">{gene.receptor}</span>
              </span>
              <span className="relative h-1 rounded-full bg-white/10">
                <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/25" />
                <span className="absolute top-0 h-full rounded-full bg-gene" style={{ left: `${left}%`, width: `${width}%` }} />
              </span>
              <span className="text-right font-mono text-[10px] text-white/55 tabular-nums">{gene.z.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttentionMatrix({ caseData }: { caseData: CaseFile }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: "easeOut" }}>
      <p className="mb-1.5 font-mono text-[11px] tracking-wide text-fuse">Head-averaged token attention (4 heads) · not a contribution score</p>
      <div className="grid grid-cols-[52px_repeat(3,minmax(0,1fr))] gap-1">
        <span />
        {MODALITY.map((column) => (
          <span key={column.key} className="text-center font-mono text-[10px]" style={{ color: column.color }}>
            {column.key}
          </span>
        ))}
        {caseData.modalityAttention.map((row, rowIndex) => (
          <div key={MODALITY[rowIndex].key} className="contents">
            <span className="self-center font-mono text-[10px]" style={{ color: MODALITY[rowIndex].color }}>
              {MODALITY[rowIndex].key}
            </span>
            {row.map((weight, columnIndex) => (
              <span
                key={`${rowIndex}-${columnIndex}`}
                className="flex h-8 items-center justify-center rounded-md border border-white/8 font-mono text-[11px] text-white tabular-nums"
                style={{ background: `rgba(139, 124, 246, ${0.08 + weight * 0.7})` }}
              >
                {weight.toFixed(2)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <div className="rounded-[12px] border border-white/10 px-2.5 py-2" title={title}>
      <p className="font-mono text-[10px] text-white/40">{label}</p>
      <p className="mt-1 font-mono text-[13px] text-white tabular-nums">{value}</p>
    </div>
  );
}
