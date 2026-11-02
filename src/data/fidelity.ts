import { clinicalBars } from "./clinical";
import type { CaseFile } from "../types/case";

/** Signatures of the pictures that must change when the patient changes. Architecture shapes are not included. */
export function visualSignature(caseData: CaseFile): Record<string, string> {
  const token = (key: "clinical" | "gene" | "wsi") => (caseData.tokens?.[key] ?? []).map((value) => value.toFixed(4)).join(",");
  const top = [...caseData.tiles].sort((a, b) => b.attn - a.attn).slice(0, 6);
  return {
    clinical: clinicalBars(caseData.clinical).bars.join(","),
    helix: caseData.genes.map((gene) => `${gene.symbol}:${gene.z}`).join(","),
    terrain: caseData.tiles.map((tile) => tile.attn.toFixed(5)).join(","),
    needles: (caseData.tileEmbedding?.norm ?? []).map((value) => value.toFixed(4)).join(","),
    barcodes: `${token("clinical")}|${token("gene")}|${token("wsi")}`,
    activations: JSON.stringify(caseData.activations ?? {}),
    fusion: caseData.modalityAttention.map((row) => row.join(",")).join(";"),
    gauges: [caseData.pred.ER, caseData.pred.PR, caseData.pred.HER2].join(","),
    top6: top.map((tile) => tile.attn.toFixed(5)).join(","),
  };
}
