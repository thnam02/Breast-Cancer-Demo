import type { Receptor } from "../types/case";

/** Bibliographic facts from the published chapter. Not model metrics. */
export const PAPER = {
  title: "A Multimodal Deep Learning Framework for Breast Cancer Receptor Status Prediction",
  citation: "Tran et al., IUKM 2026",
  venue: "IUKM 2026",
  conference:
    "12th International Symposium on Integrated Uncertainty in Knowledge Modelling and Decision Making",
  place: "Quy Nhon, Vietnam",
  dates: "14–17 September 2026",
  series: "Lecture Notes in Artificial Intelligence",
  seriesShort: "LNAI",
  volume: "16918",
  pages: "102–114",
  publisher: "Springer Nature Singapore",
  doi: "10.1007/978-981-92-5641-9_9",
  doiUrl: "https://doi.org/10.1007/978-981-92-5641-9_9",
  disclaimer:
    "Decision-support research prototype. Complements, does not replace, IHC/ISH testing. Not for clinical use.",
} as const;

export const AUTHORS = [
  {
    name: "Binh Minh Tran",
    affiliation: "The University of Sydney, Sydney, Australia",
    equal: true,
  },
  {
    name: "Van An Nguyen",
    affiliation: "Hanoi Medical University, Hanoi, Vietnam",
    equal: true,
  },
  {
    name: "Luong Hai Nguyen",
    affiliation: "Hanoi University of Industry, Hanoi, Vietnam",
  },
  {
    name: "Quynh Anh Dang",
    affiliation: "Hanoi Medical University, Hanoi, Vietnam",
  },
  {
    name: "Ngoc Minh Hai Nguyen",
    affiliation: "Hanoi Medical University Hospital, Hanoi, Vietnam",
  },
  {
    name: "Quang Anh Nguyen",
    affiliation: "Macquarie University, Sydney, Australia",
  },
  {
    name: "Hai Nam Tran",
    affiliation: "University of New South Wales, Sydney, Australia",
  },
  {
    name: "Thi Bich Van Nguyen",
    affiliation:
      "Hanoi Medical University; Hanoi Medical University Hospital; National Hospital of Obstetrics and Gynecology, Hanoi, Vietnam",
    corresponding: true,
  },
  {
    name: "Dang Hung Tran",
    affiliation: "Hanoi University of Industry, Hanoi, Vietnam",
    corresponding: true,
  },
] as const;

export type ModalityKey = "clinical" | "gene" | "wsi";

export interface ModalitySelection {
  clinical: boolean;
  gene: boolean;
  wsi: boolean;
}

/** [ER, PR, HER2, Mean] AUC on TCGA-BRCA, 5-fold CV. */
export const ABLATIONS = [
  {
    id: "clinical",
    label: "Clinical only",
    mods: { clinical: true, gene: false, wsi: false },
    auc: [0.508, 0.514, 0.624, 0.548],
  },
  {
    id: "wsi",
    label: "WSI only",
    mods: { clinical: false, gene: false, wsi: true },
    auc: [0.839, 0.81, 0.729, 0.793],
  },
  {
    id: "gene",
    label: "Gene only",
    mods: { clinical: false, gene: true, wsi: false },
    auc: [0.878, 0.859, 0.799, 0.845],
  },
  {
    id: "wsi-clin",
    label: "WSI + Clin",
    mods: { clinical: true, gene: false, wsi: true },
    auc: [0.878, 0.798, 0.696, 0.791],
  },
  {
    id: "gene-clin",
    label: "Gene + Clin",
    mods: { clinical: true, gene: true, wsi: false },
    auc: [0.953, 0.892, 0.809, 0.884],
  },
  {
    id: "wsi-gene",
    label: "WSI + Gene",
    mods: { clinical: false, gene: true, wsi: true },
    auc: [0.958, 0.881, 0.826, 0.888],
  },
  {
    id: "all",
    label: "All three",
    mods: { clinical: true, gene: true, wsi: true },
    auc: [0.954, 0.868, 0.848, 0.89],
  },
] as const;

export const FUSION_INSIGHT =
  "Fusion helps HER2 most: 0.848 trimodal vs 0.826 WSI+Gene vs 0.809 Gene+Clin.";

export const BENCHMARKS = [
  { name: "Gamble 2021", auc: [0.83, 0.72, 0.58, 0.71], ours: false },
  { name: "Arslan 2024", auc: [0.806, 0.744, null, 0.775], ours: false },
  { name: "Wang 2024", auc: [0.896, 0.864, 0.699, 0.82], ours: false },
  { name: "Pignet 2025", auc: [0.904, 0.809, 0.818, 0.844], ours: false },
  { name: "Zhang Q. 2025", auc: [0.933, 0.887, 0.746, 0.855], ours: false },
  { name: "Ours", auc: [0.954, 0.868, 0.848, 0.89], ours: true },
] as const;

export const BENCHMARK_FOOTNOTE =
  "Comparators use different patient subsets and CV protocols. Arslan 2024 does not report HER2 in this table; the mean shown is the published comparator mean.";

export type MetricKey = "AUC" | "AUPRC" | "F1" | "Accuracy";
export type CohortArm = "ER" | "PR" | "HER2" | "macro";

/** [mean, std]. Std is null where the paper constants do not report one. */
export type MeanStd = readonly [number, number | null];

export const EXTERNAL: Record<
  MetricKey,
  {
    tcga: Record<CohortArm, MeanStd>;
    cptac: Record<CohortArm, MeanStd>;
  }
> = {
  AUC: {
    tcga: { ER: [0.954, 0.027], PR: [0.868, 0.026], HER2: [0.848, 0.026], macro: [0.89, null] },
    cptac: { ER: [0.961, 0.018], PR: [0.926, 0.028], HER2: [0.907, 0.051], macro: [0.931, null] },
  },
  AUPRC: {
    tcga: { ER: [0.983, 0.01], PR: [0.895, 0.036], HER2: [0.668, 0.038], macro: [0.849, null] },
    cptac: { ER: [0.988, 0.006], PR: [0.959, 0.018], HER2: [0.796, 0.104], macro: [0.914, null] },
  },
  F1: {
    tcga: { ER: [0.966, 0.011], PR: [0.903, 0.012], HER2: [0.613, 0.046], macro: [0.827, null] },
    cptac: { ER: [0.938, 0.022], PR: [0.877, 0.033], HER2: [0.581, 0.105], macro: [0.799, null] },
  },
  Accuracy: {
    tcga: { ER: [0.947, 0.017], PR: [0.862, 0.017], HER2: [0.804, 0.036], macro: [0.871, null] },
    cptac: { ER: [0.911, 0.03], PR: [0.844, 0.038], HER2: [0.856, 0.035], macro: [0.87, null] },
  },
};

export const COHORTS = {
  tcga: {
    name: "TCGA-BRCA",
    role: "Development",
    n: 937,
    counts: {
      ER: { pos: 725, neg: 212 },
      PR: { pos: 626, neg: 311 },
      HER2: { pos: 191, neg: 746 },
    },
  },
  cptac: {
    name: "CPTAC-BRCA",
    role: "External",
    n: 122,
    counts: {
      ER: { pos: 81, neg: 39 },
      PR: { pos: 68, neg: 47 },
      HER2: { pos: 13, neg: 82 },
    },
  },
} as const;

export const TOP_GENES: Record<Receptor, readonly string[]> = {
  ER: ["ESR1", "GATA3", "AGR3"],
  PR: ["PGR", "ESR1", "CA12"],
  HER2: ["ERBB2", "GRB7", "TCAP"],
};

export const TRAINING_CHIPS = [
  "batch 32",
  "200 epochs",
  "dropout 0.2",
  "wd 8e-5",
  "lr 3e-4 (non-WSI)",
  "lr 4e-5 (WSI)",
  "d_f = 64",
] as const;

export const LEAKAGE_NOTE =
  "All imputation, scaling, and gene selection are fit inside each training fold. CPTAC is evaluated frozen: no retraining, tuning, reselection, or threshold changes.";

export const ARCH_CAPTIONS = {
  encode:
    "X_w ∈ ℝ^(K×1536) → 512-d → [CLS] + 4-layer, 8-head Transformer → gated attention pooling → 64-d",
  fuse: "S ∈ ℝ^(3×64) → T = LN(MHA(S,S,S) + S) → f ∈ ℝ^192",
} as const;

export const PLAY_SENTENCES = [
  "Clinical: median impute, Unknown category, one-hot. Genes: top-5,000 variance, MI selection, standardise. WSI: tiling, frozen UNI2-h, then ≤512 tiles.",
  "Tile embeddings are contextualised by a 4-layer, 8-head Transformer, then gated-attention pooling computes one shared tile-weight map and a 64-d slide token.",
  "Clinical, gene, and slide tokens attend to each other and flatten to 192 dimensions.",
  "A shared trunk feeds linear ER and PR heads and a nonlinear HER2 head. The probabilities are the precomputed values in the case file.",
  "Revealing tile weights computed by the WSI encoder's attention pooling.",
] as const;

export function sameMods(a: ModalitySelection, b: ModalitySelection): boolean {
  return a.clinical === b.clinical && a.gene === b.gene && a.wsi === b.wsi;
}

export function ablationFor(mods: ModalitySelection) {
  return ABLATIONS.find((row) => sameMods(row.mods, mods)) ?? ABLATIONS[6];
}

export function formatMeanStd(pair: MeanStd, digits = 3): string {
  const mean = pair[0].toFixed(digits);
  if (pair[1] == null) return mean;
  return `${mean} ± ${pair[1].toFixed(digits)}`;
}

export function receptorPattern(ihc: Record<Receptor, 0 | 1>): string {
  return (["ER", "PR", "HER2"] as const)
    .map((key) => `${key}${ihc[key] === 1 ? "+" : "−"}`)
    .join(" ");
}
