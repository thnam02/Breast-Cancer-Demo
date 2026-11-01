export const RECEPTORS = ["ER", "PR", "HER2"] as const;
export type Receptor = (typeof RECEPTORS)[number];

export interface ClinicalRecord {
  age: number;
  sex: string;
  side: string;
  histology: string;
  stage: string;
  tnm: string;
}

export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  attn: number;
}

export interface TopTile {
  rank: number;
  img: string;
  attn: number;
}

export interface GeneRecord {
  symbol: string;
  z: number;
  receptor: Receptor;
}

/**
 * Replay payload for one case. Every number the demo shows for a patient
 * comes from this file. `mock` marks a synthetic placeholder; omit it on
 * real exports so the synthetic-data chip stays hidden.
 */
export interface CaseFile {
  caseId: string;
  cohort: string;
  mock?: boolean;
  mockNote?: string;
  clinical: ClinicalRecord;
  ihc: Record<Receptor, 0 | 1>;
  pred: Record<Receptor, number>;
  slide: {
    thumb: string;
    width: number;
    height: number;
    dzi: string | null;
  };
  tiles: Tile[];
  topTiles: TopTile[];
  /** Head-averaged 4-head token attention. Rows/columns: clinical, gene, wsi. Not a contribution score. */
  modalityAttention: number[][];
  genes: GeneRecord[];
}

export function assertCaseFile(data: unknown): CaseFile {
  if (!data || typeof data !== "object") {
    throw new Error("case.json is not an object");
  }
  const row = data as Partial<CaseFile>;
  if (
    typeof row.caseId !== "string" ||
    !row.clinical ||
    !row.ihc ||
    !row.pred ||
    !row.slide ||
    !Array.isArray(row.tiles) ||
    !Array.isArray(row.topTiles) ||
    !Array.isArray(row.modalityAttention) ||
    !Array.isArray(row.genes)
  ) {
    throw new Error("case.json is missing required fields");
  }
  return row as CaseFile;
}

export function caseAsset(caseId: string, relative: string): string {
  if (relative.startsWith("http://") || relative.startsWith("https://") || relative.startsWith("/")) {
    return relative;
  }
  return `/cases/${caseId}/${relative}`;
}
