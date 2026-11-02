import type { ClinicalRecord } from "../types/case";

/** Bar heights for the clinical slab. The slab itself stays the same size for every patient. */
export function clinicalBars(clinical: ClinicalRecord): { bars: [number, number, number, number]; label: string } {
  const t = Number(clinical.tnm.match(/T(\d)/i)?.[1] ?? "1");
  const n = Number(clinical.tnm.match(/N(\d)/i)?.[1] ?? "0");
  const tBar = t <= 1 ? 0.33 : t === 2 ? 0.66 : 1;
  const nBar = n <= 0 ? 0.1 : n === 1 ? 0.4 : n === 2 ? 0.7 : 1;
  const stage = clinical.stage.toUpperCase();
  const stageBar = stage.startsWith("IV") || stage.startsWith("4") ? 1 : stage.startsWith("III") || stage.startsWith("3") ? 0.75 : stage.startsWith("II") || stage.startsWith("2") ? 0.5 : 0.25;
  return {
    bars: [Math.min(1, clinical.age / 100), tBar, nBar, stageBar],
    label: `Age ${clinical.age} · T${t} · N${n} · Stage ${clinical.stage}`,
  };
}
