import { THRESHOLD } from "../config/model";
import { ARCH_CAPTIONS, PLAY_SENTENCES, receptorPattern } from "../data/paper";
import type { AttentionStats } from "../lib/attention";
import type { Timeline } from "../lib/timeline";
import type { CaseFile, Receptor } from "../types/case";
import { MetricCard } from "./MetricCard";
import { Stepper } from "./Stepper";

const RECEPTORS: Receptor[] = ["ER", "PR", "HER2"];
const MODALITY = [
  { key: "Clinical", color: "#F5B84B" },
  { key: "Gene", color: "#3EE0B0" },
  { key: "WSI", color: "#FF5FA2" },
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
  stats: AttentionStats;
}) {
  const geneReveal = timeline.running ? timeline.ingest : 1;
  const matrixReveal = timeline.running ? timeline.fuse : 1;
  const numbersHidden = timeline.running && timeline.predict === 0;
  const maxAbs = Math.max(...caseData.genes.map((gene) => Math.abs(gene.z)), 1);
  const playCaption =
    timeline.running &&
    timeline.stepIndex >= 0 &&
    timeline.stepIndex < PLAY_SENTENCES.length &&
    (timeline.mode === "play" || timeline.stepIndex === 0 || timeline.stepIndex === 4)
      ? PLAY_SENTENCES[timeline.stepIndex]
      : undefined;
  const formula =
    timeline.running && timeline.stepIndex === 1
      ? ARCH_CAPTIONS.encode
      : timeline.running && timeline.stepIndex === 2
        ? ARCH_CAPTIONS.fuse
        : undefined;
  const progress = timeline.running ? (Math.min(4, timeline.stepIndex) + (timeline.stepIndex > 4 ? 0 : timeline.local)) / 5 : undefined;
  const matrixOk = caseData.modalityAttention.length === 3 && caseData.modalityAttention.every((row) => row.length === 3);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3 min-[900px]:h-full min-[900px]:overflow-y-auto min-[900px]:pr-1">
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
              <span className="mt-1 block font-mono text-[10px] text-gt">{receptorPattern(item.ihc)}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {RECEPTORS.map((receptor) => (
          <MetricCard
            key={receptor}
            receptor={receptor}
            probability={caseData.pred[receptor]}
            hidden={numbersHidden}
            showIhc={showIhc}
            ihc={caseData.ihc[receptor]}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] tracking-wide text-white/40">Precomputed · positive if probability ≥ {THRESHOLD.toFixed(1)}</p>

      <div>
        <p className="mb-1.5 font-mono text-[11px] tracking-wide text-gene">
          Gene expression z-scores · patient input{caseData.mock ? " · synthetic" : ""}
        </p>
        <div className="space-y-1">
          {caseData.genes.map((gene) => {
            const width = (Math.abs(gene.z) / maxAbs) * 50 * geneReveal;
            const left = gene.z >= 0 ? 50 : 50 - width;
            return (
              <div key={`${gene.receptor}-${gene.symbol}`} className="grid grid-cols-[64px_1fr_36px] items-center gap-2">
                <span className="font-mono text-[10px] text-white/80">
                  {gene.symbol}
                  <span className="ml-1 text-white/35">{gene.receptor}</span>
                </span>
                <span className="relative h-1.5 rounded-full bg-white/5">
                  <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/25" />
                  <span className="absolute top-0 h-full rounded-full bg-gene" style={{ left: `${left}%`, width: `${width}%` }} />
                </span>
                <span className="text-right font-mono text-[10px] text-white/55 tabular-nums">{gene.z.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[11px] tracking-wide text-fuse">
          Head-averaged token attention (4 heads) — not a contribution score
        </p>
        {matrixOk ? (
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
                {row.map((weight, columnIndex) => {
                  const appear = timeline.running
                    ? Math.min(1, Math.max(0, matrixReveal * 1.35 - (rowIndex * 3 + columnIndex) * 0.06))
                    : 1;
                  return (
                    <span
                      key={`${rowIndex}-${columnIndex}`}
                      className="flex h-8 items-center justify-center rounded-md border border-white/8 font-mono text-[11px] text-white tabular-nums"
                      style={{
                        background: `rgba(124, 92, 255, ${0.08 + weight * 0.75})`,
                        opacity: appear,
                        transform: `translateY(${(1 - appear) * 6}px)`,
                      }}
                    >
                      {weight.toFixed(2)}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/60">This case file does not contain a 3×3 modality matrix.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Top-100 mass" value={`${(stats.top100 * 100).toFixed(1)}%`} title="Share of attention held by the 100 heaviest tiles" />
        <Stat label="Entropy" value={`${stats.entropy.toFixed(2)} nats`} title="Shannon entropy of the tile weights, in nats" />
      </div>

      <Stepper
        activeIndex={timeline.running ? timeline.stepIndex : -1}
        caption={playCaption}
        formula={formula}
        progress={progress}
      />

      <div className="space-y-2 min-[900px]:sticky min-[900px]:bottom-0 min-[900px]:z-10 min-[900px]:bg-gradient-to-t min-[900px]:from-bg min-[900px]:from-70% min-[900px]:to-transparent min-[900px]:pt-3 min-[900px]:pb-1">
        <button
          type="button"
          onClick={onRun}
          className="h-11 w-full rounded-[14px] border border-ok bg-ok/10 font-mono text-[13px] tracking-wide text-ok hover:bg-ok/20"
        >
          {timeline.running && timeline.mode === "run" ? "Replaying…" : "Run inference"}
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
          {timeline.running && timeline.mode === "play" ? "Playing…" : "Play pipeline"}
        </button>
        <p className="text-center font-mono text-[10px] text-white/35">Space run · I IHC · H heat · replay only</p>
      </div>
    </div>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <div className="panel px-3 py-2" title={title}>
      <p className="font-mono text-[10px] tracking-wide text-white/45">{label}</p>
      <p className="mt-1 font-mono text-[16px] text-white tabular-nums">{value}</p>
    </div>
  );
}
