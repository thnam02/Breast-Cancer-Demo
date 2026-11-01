import { LEAKAGE_NOTE, TRAINING_CHIPS } from "../data/paper";
import { ArchitectureDiagram } from "./ArchitectureDiagram";
import { HudChip } from "./HudChip";
import { LossExplorer } from "./LossExplorer";
import { SectionHeading } from "./SectionHeading";
import { Tex } from "./Tex";

export function HowItWorks() {
  return (
    <section id="method" className="mx-auto w-full max-w-[1680px] px-3 py-12 sm:px-5">
      <SectionHeading kicker="How it works" title="Three encoders, one fused trunk">
        Clinical data, gene expression and H&E tiles each become a 64-d token. Modality self-attention mixes them before the receptor heads.
      </SectionHeading>
      <ArchitectureDiagram />
      <div className="mt-4 grid gap-4">
        <LossExplorer />
        <article className="panel p-4 sm:p-5">
          <h3 className="font-mono text-sm font-bold text-fuse">
            Uncertainty-based multitask weighting · Training only — not part of inference
          </h3>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-white/75">
            Task k is weighted by 1/(2σ<sub>k</sub>²), with a log σ<sub>k</sub> term on the same scale.
          </p>
          <Tex tex={String.raw`L=\sum_k\left[\frac{L_k}{2\sigma_k^2}+\log\sigma_k\right]`} />
        </article>
        <div className="flex flex-wrap gap-2">
          {TRAINING_CHIPS.map((chip) => (
            <HudChip key={chip}>{chip}</HudChip>
          ))}
        </div>
        <article className="rounded-[14px] border border-ok/40 bg-ok/8 px-4 py-3">
          <h3 className="font-mono text-[12px] font-bold tracking-wide text-ok">Leakage guard</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-white/85">{LEAKAGE_NOTE}</p>
        </article>
      </div>
    </section>
  );
}
