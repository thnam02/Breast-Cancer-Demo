import { COHORTS, TOP_GENES } from "../data/paper";
import type { Receptor } from "../types/case";
import { BenchmarkChart } from "./BenchmarkChart";
import { ExternalValidation } from "./ExternalValidation";
import { SectionHeading } from "./SectionHeading";

const RECEPTOR_TONE: Record<Receptor, string> = {
  ER: "#F5B84B",
  PR: "#3EE0B0",
  HER2: "#FF5FA2",
};

export function ResultsSection() {
  return (
    <section id="results" className="mx-auto w-full max-w-[1680px] px-3 py-12 sm:px-5">
      <SectionHeading kicker="Results" title="Held-out performance, then an external cohort">
        Every figure in this section uses the constants reported for the paper. Case-level probabilities stay in the demo above.
      </SectionHeading>
      <div className="grid gap-4">
        <BenchmarkChart />
        <ExternalValidation />
        <Cohorts />
        <Interpretability />
      </div>
    </section>
  );
}

function Cohorts() {
  return (
    <article className="panel p-4 sm:p-5">
      <h3 className="text-lg font-semibold">Cohorts</h3>
      <p className="mt-1 text-sm text-white/60">Positive share of the reported positive and negative counts. HER2 is the scarce class.</p>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {(["tcga", "cptac"] as const).map((key) => {
          const cohort = COHORTS[key];
          return (
            <div key={key}>
              <p className="font-mono text-[12px] text-white">
                {cohort.role} · {cohort.name} · n={cohort.n}
                {key === "cptac" ? " · some cases lack labels" : ""}
              </p>
              <div className="mt-3 space-y-3">
                {(Object.keys(cohort.counts) as Receptor[]).map((receptor) => {
                  const counts = cohort.counts[receptor];
                  const total = counts.pos + counts.neg;
                  const posShare = total === 0 ? 0 : counts.pos / total;
                  const highlight = receptor === "HER2";
                  return (
                    <div key={receptor} className={highlight ? "rounded-[12px] border border-model/50 p-2" : "p-2"}>
                      <div className="mb-1 flex items-baseline justify-between font-mono text-[12px]">
                        <span className={highlight ? "text-model" : "text-white/80"}>{receptor}</span>
                        <span className="text-white/70 tabular-nums">
                          +{counts.pos} / −{counts.neg}
                        </span>
                      </div>
                      <div className="flex h-3 overflow-hidden rounded-full bg-white/10">
                        <span className="h-full bg-gt" style={{ width: `${posShare * 100}%` }} />
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-white/40 tabular-nums">
                        {(posShare * 100).toFixed(1)}% positive of {total} labelled cases
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-white/70">
        HER2-positive cases are the minority in both cohorts: 191 / 746 in TCGA-BRCA and 13 / 82 in CPTAC-BRCA.
      </p>
      <p className="mt-1 font-mono text-[10px] text-white/40">
        Some cases lack labels. Bars use the reported positive and negative counts, so CPTAC PR and HER2 totals do not equal n=122.
      </p>
    </article>
  );
}

function Interpretability() {
  return (
    <article className="panel p-4 sm:p-5">
      <h3 className="text-lg font-semibold">Cohort-level gene ranking (mutual information)</h3>
      <p className="mt-1 text-sm text-white/60">Cohort-level ranking from the paper; these are not per-patient expression values.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {(Object.keys(TOP_GENES) as Receptor[]).map((receptor) => (
          <div key={receptor}>
            <p className="font-mono text-[12px] font-bold" style={{ color: RECEPTOR_TONE[receptor] }}>
              {receptor}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TOP_GENES[receptor].map((symbol) => (
                <span key={symbol} className="rounded-full border border-white/10 bg-black/40 px-3 py-1 font-mono text-[12px]">
                  {symbol}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
