import { THRESHOLD } from "../config/model";
import type { ReactNode } from "react";
import type { CaseFile, Receptor } from "../types/case";

const RECEPTORS: Receptor[] = ["ER", "PR", "HER2"];

export function ClinicalWorkflow({ caseData, showIhc }: { caseData: CaseFile; showIhc: boolean }) {
  const discordant =
    showIhc && RECEPTORS.some((receptor) => Number(caseData.pred[receptor] >= THRESHOLD) !== caseData.ihc[receptor]);

  return (
    <article className="panel mt-4 p-4" aria-label="Clinical workflow">
      <h3 className="font-mono text-[12px] font-bold tracking-wide text-white">Clinical workflow</h3>
      <div className="mt-3 flex flex-wrap items-stretch gap-2 font-mono text-[11px]">
        <Step>Biopsy</Step>
        <Arrow />
        <Step>
          H&amp;E + RNA-seq + clinical
          <span className="mt-1 block text-[9px] text-gene">RNA-seq · current deployment limitation</span>
        </Step>
        <Arrow />
        <Step tone="fuse">ReceptorLens</Step>
        <Arrow />
        <Step tone="gt">Compare with IHC/ISH</Step>
        <Arrow />
        <div className="grid min-w-[220px] flex-1 gap-2 sm:grid-cols-2">
          <Step tone="ok">Concordant · supporting evidence</Step>
          <div
            className={`rounded-[12px] border px-3 py-2 ${
              discordant
                ? "border-model bg-model/15 text-model shadow-[0_0_18px_rgba(255,90,95,0.28)]"
                : "border-white/10 bg-black/25 text-white/65"
            }`}
          >
            Discordant · flag for review
          </div>
        </div>
      </div>
    </article>
  );
}

function Step({ children, tone }: { children: ReactNode; tone?: "gt" | "fuse" | "ok" }) {
  const style =
    tone === "gt"
      ? "border-gt/50 text-gt"
      : tone === "fuse"
        ? "border-fuse/50 text-fuse"
        : tone === "ok"
          ? "border-ok/50 text-ok"
          : "border-white/10 text-white/75";
  return <div className={`min-w-[112px] flex-1 rounded-[12px] border bg-black/25 px-3 py-2 ${style}`}>{children}</div>;
}

function Arrow() {
  return <span className="self-center text-white/30" aria-hidden>→</span>;
}
