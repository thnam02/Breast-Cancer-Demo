import { useState } from "react";
import { ABLATIONS, FUSION_INSIGHT, ablationFor, type ModalityKey, type ModalitySelection } from "../data/paper";
import { SectionHeading } from "./SectionHeading";

const TOGGLES: { key: ModalityKey; label: string; className: string }[] = [
  { key: "clinical", label: "Clinical", className: "border-gt text-gt data-[on=true]:bg-gt/15" },
  { key: "gene", label: "Gene expression", className: "border-gene text-gene data-[on=true]:bg-gene/15" },
  { key: "wsi", label: "WSI", className: "border-wsi text-wsi data-[on=true]:bg-wsi/15" },
];

const ARMS = ["ER", "PR", "HER2", "Mean"] as const;

export function ModalityLab() {
  const [mods, setMods] = useState<ModalitySelection>({ clinical: true, gene: true, wsi: true });
  const selected = ablationFor(mods);
  const full = ABLATIONS[6];

  const toggle = (key: ModalityKey) => {
    setMods((current) => {
      const next = { ...current, [key]: !current[key] };
      if (!next.clinical && !next.gene && !next.wsi) return current;
      return next;
    });
  };

  return (
    <section id="modality" className="mx-auto w-full max-w-[1680px] px-3 py-12 sm:px-5">
      <SectionHeading kicker="Modality lab" title="What each stream is worth">
        Cohort AUCs from 5-fold CV (paper Fig. 4), not per-patient results. The ghost outline is the full three-modality model.
      </SectionHeading>

      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {TOGGLES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={mods[item.key]}
              data-on={mods[item.key]}
              onClick={() => toggle(item.key)}
              className={`rounded-full border px-3 py-1.5 font-mono text-[12px] hover:brightness-125 ${item.className}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="mt-4 font-mono text-sm text-white">{selected.label}</p>
        <div className="mt-3 space-y-3">
          {ARMS.map((arm, index) => (
            <div key={arm} className="grid grid-cols-[52px_1fr_52px] items-center gap-3">
              <span className="font-mono text-[12px] text-white/70">{arm}</span>
              <div className="relative h-7">
                <div className="absolute inset-y-1 right-0 left-0 rounded-full bg-white/5" />
                <div
                  className="absolute inset-y-1 left-0 rounded-full border border-white/35"
                  style={{ width: `${full.auc[index] * 100}%` }}
                  title={`Full model ${full.auc[index].toFixed(3)}`}
                />
                <div
                  className="absolute inset-y-1.5 left-0 rounded-full bg-model"
                  style={{ width: `${selected.auc[index] * 100}%` }}
                />
                <span className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" title="0.50" />
              </div>
              <span className="text-right font-mono text-[12px] text-white tabular-nums">{selected.auc[index].toFixed(3)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] text-white/40">Axis 0–1 · tick at 0.50 · outline is all three modalities</p>

        <div className="mt-5 max-w-full min-w-0 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="font-mono text-[11px] tracking-wide text-white/45">
                <th className="py-2 font-medium">Combination</th>
                {ARMS.map((arm) => (
                  <th key={arm} className="py-2 text-right font-medium">
                    {arm}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ABLATIONS.map((row) => {
                const on = row.id === selected.id;
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    role="button"
                    aria-pressed={on}
                    onClick={() => setMods({ ...row.mods })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setMods({ ...row.mods });
                      }
                    }}
                    className={`cursor-pointer hover:bg-white/5 ${on ? "bg-model/10" : ""}`}
                  >
                    <td className="px-2 py-2 font-mono text-[12px] text-white">{row.label}</td>
                    {row.auc.map((value, index) => (
                      <td key={ARMS[index]} className="px-2 py-2 text-right font-mono text-[12px] tabular-nums text-white/85">
                        {value.toFixed(3)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 rounded-[14px] border border-fuse/50 bg-fuse/10 px-4 py-3 text-[15px] text-white">{FUSION_INSIGHT}</p>
      </div>
    </section>
  );
}
