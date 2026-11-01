import { useState } from "react";
import { BENCHMARKS, BENCHMARK_FOOTNOTE } from "../data/paper";

const TABS = ["ER", "PR", "HER2", "Mean"] as const;

export function BenchmarkChart() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("ER");
  const index = TABS.indexOf(tab);
  const rows = BENCHMARKS.map((row) => ({ ...row, value: row.auc[index] })).sort((a, b) => {
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    return b.value - a.value;
  });

  return (
    <article className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">H&E-only baselines</h3>
          <p className="mt-1 text-sm text-white/60">TCGA-BRCA AUC. Ours is the trimodal model.</p>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Receptor">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === tab}
              onClick={() => setTab(item)}
              className={`rounded-full px-3 py-1 font-mono text-[12px] ${
                item === tab ? "bg-white text-black" : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-5 space-y-2.5">
        {rows.map((row, rank) => {
          const width = row.value == null ? 0 : ((row.value - 0.5) / 0.5) * 100;
          return (
            <li key={row.name} className="grid grid-cols-[28px_minmax(108px,150px)_1fr_64px] items-center gap-2">
              <span className="font-mono text-[11px] text-white/35">{row.value == null ? "—" : rank + 1}</span>
              <span className={`font-mono text-[12px] ${row.ours ? "text-model" : "text-white/80"}`}>{row.name}</span>
              <span className="relative h-3 rounded-full bg-white/5">
                {row.value != null ? (
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${row.ours ? "bg-model shadow-[0_0_16px_rgba(255,90,95,0.65)]" : "bg-white/35"}`}
                    style={{ width: `${Math.max(0, Math.min(100, width))}%` }}
                  />
                ) : null}
              </span>
              <span className="text-right font-mono text-[12px] tabular-nums text-white/80">
                {row.value == null ? "n/a" : row.value.toFixed(3)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 font-mono text-[10px] text-white/40">Axis 0.50–1.00. {BENCHMARK_FOOTNOTE}</p>
    </article>
  );
}
