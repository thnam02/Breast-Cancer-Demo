import { useState } from "react";
import { EXTERNAL, formatMeanStd, type CohortArm, type MetricKey } from "../data/paper";

const METRICS: MetricKey[] = ["AUC", "AUPRC", "F1", "Accuracy"];
const ARMS: { key: CohortArm; label: string }[] = [
  { key: "ER", label: "ER" },
  { key: "PR", label: "PR" },
  { key: "HER2", label: "HER2" },
  { key: "macro", label: "Macro" },
];

const DOMAIN_MIN = 0.4;
const DOMAIN_MAX = 1;

function position(value: number) {
  return ((value - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * 100;
}

export function ExternalValidation() {
  const [metric, setMetric] = useState<MetricKey>("AUC");
  const block = EXTERNAL[metric];

  return (
    <article className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Internal vs external</h3>
          <p className="mt-1 text-sm text-white/60">TCGA-BRCA solid, CPTAC-BRCA outlined. Whiskers are ± std where reported.</p>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Metric">
          {METRICS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === metric}
              onClick={() => setMetric(item)}
              className={`rounded-full px-3 py-1 font-mono text-[12px] ${
                item === metric ? "bg-white text-black" : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {ARMS.map((arm) => {
          const tcga = block.tcga[arm.key];
          const cptac = block.cptac[arm.key];
          return (
            <div key={arm.key} className="grid grid-cols-[64px_1fr] gap-3 sm:grid-cols-[72px_1fr_150px]">
              <span className="pt-1 font-mono text-[12px] text-white/75">{arm.label}</span>
              <div className="relative h-10">
                <Bar kind="solid" mean={tcga[0]} std={tcga[1]} top={2} />
                <Bar kind="outline" mean={cptac[0]} std={cptac[1]} top={22} />
              </div>
              <div className="hidden font-mono text-[11px] leading-5 text-white/75 tabular-nums sm:block">
                <p>{formatMeanStd(tcga)}</p>
                <p>{formatMeanStd(cptac)}</p>
              </div>
              <div className="col-start-2 font-mono text-[11px] text-white/70 tabular-nums sm:hidden">
                TCGA {formatMeanStd(tcga)} · CPTAC {formatMeanStd(cptac)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex gap-4 font-mono text-[11px] text-white/55">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-full bg-model" /> TCGA
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-6 rounded-full border border-model" /> CPTAC
        </span>
      </div>
      <p className="mt-2 font-mono text-[10px] text-white/40">Axis {DOMAIN_MIN.toFixed(2)}–{DOMAIN_MAX.toFixed(2)}. Macro rows have no reported standard deviation.</p>
    </article>
  );
}

function Bar({ kind, mean, std, top }: { kind: "solid" | "outline"; mean: number; std: number | null; top: number }) {
  const left = Math.max(0, position(mean));
  return (
    <>
      <span
        className={`absolute h-3 rounded-full ${kind === "solid" ? "bg-model" : "border border-model"}`}
        style={{ top, left: 0, width: `${Math.min(100, Math.max(0, left))}%` }}
      />
      {std != null ? (
        <span
          className="absolute h-3"
          style={{
            top,
            left: `${position(mean - std)}%`,
            width: `${Math.max(0, position(mean + std) - position(mean - std))}%`,
          }}
        >
          <span className="absolute top-1/2 right-0 left-0 h-px bg-white" />
          <span className="absolute top-0 bottom-0 left-0 w-px bg-white" />
          <span className="absolute top-0 right-0 bottom-0 w-px bg-white" />
        </span>
      ) : null}
    </>
  );
}
