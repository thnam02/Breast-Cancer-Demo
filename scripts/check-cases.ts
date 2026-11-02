/**
 * Validate public/cases against the replay schema.
 * Warnings stay on stderr and do not fail the run. Schema errors exit 1.
 *
 * SYN-04 PR is an intended discordance (PGR RNA and the stored probability
 * are positive while IHC is negative). Gene-versus-probability warnings skip
 * that pair on purpose.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("public/cases");
const cohorts = new Set(["TCGA-BRCA", "CPTAC-BRCA", "Synthetic"]);
const errors: string[] = [];
const warnings: string[] = [];

const index = JSON.parse(await readFile(path.join(root, "index.json"), "utf8")) as { cases?: unknown };
if (!Array.isArray(index.cases) || index.cases.some((id) => typeof id !== "string")) {
  errors.push("index.json is missing a string[] cases list");
}
const listed = Array.isArray(index.cases) ? (index.cases as string[]) : [];
const folders = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
for (const folder of folders) {
  if (!listed.includes(folder)) errors.push(`${folder} is on disk but missing from index.json`);
}
for (const id of listed) {
  if (!folders.includes(id)) errors.push(`index.json lists ${id} but public/cases/${id} is missing`);
}

for (const id of listed) {
  const file = path.join(root, id, "case.json");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch (cause) {
    errors.push(`${id}: unreadable case.json (${cause instanceof Error ? cause.message : "parse error"})`);
    continue;
  }
  if ("mi" in data) errors.push(`${id}: per-case "mi" is not allowed; mutual information is cohort-level only`);
  if (data.caseId !== id) errors.push(`${id}: caseId is ${String(data.caseId)}`);
  if (typeof data.cohort !== "string" || !cohorts.has(data.cohort)) {
    errors.push(`${id}: cohort must be TCGA-BRCA, CPTAC-BRCA, or Synthetic`);
  }
  if (data.descriptor !== undefined && typeof data.descriptor !== "string") errors.push(`${id}: descriptor must be a string`);

  const tiles = Array.isArray(data.tiles) ? data.tiles : null;
  if (!tiles) errors.push(`${id}: tiles must be an array`);
  const count = tiles?.length ?? 0;
  if (count === 0) errors.push(`${id}: K = tiles.length is 0`);

  const pred = asRecord(data.pred);
  for (const receptor of ["ER", "PR", "HER2"]) {
    const value = pred?.[receptor];
    if (typeof value !== "number" || value < 0 || value > 1) errors.push(`${id}: pred.${receptor} must be in [0,1]`);
  }

  const attention = Array.isArray(data.modalityAttention) ? data.modalityAttention : null;
  if (!attention || attention.length !== 3) errors.push(`${id}: modalityAttention must be 3×3`);
  attention?.forEach((row, index) => {
    if (!Array.isArray(row) || row.length !== 3 || row.some((value) => typeof value !== "number")) {
      errors.push(`${id}: modalityAttention row ${index} is not 3 numbers`);
      return;
    }
    const sum = row.reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 1) > 0.02) errors.push(`${id}: modalityAttention row ${index} sums to ${sum.toFixed(4)}, expected ≈ 1`);
  });

  const tokens = asRecord(data.tokens);
  if (tokens) {
    for (const key of ["clinical", "gene", "wsi"]) {
      const row = tokens[key];
      if (!Array.isArray(row) || row.length !== 64) errors.push(`${id}: tokens.${key} must have length 64`);
    }
  }

  const embedding = asRecord(data.tileEmbedding);
  if (embedding) {
    if (!Array.isArray(embedding.norm) || embedding.norm.length !== count) {
      errors.push(`${id}: tileEmbedding.norm length must equal K (${count})`);
    }
    if (!Array.isArray(embedding.pca) || embedding.pca.length !== count || embedding.pca.some((row) => !Array.isArray(row) || row.length !== 3)) {
      errors.push(`${id}: tileEmbedding.pca must be K×3`);
    }
  }

  const heads = data.modalityAttentionPerHead;
  if (heads !== undefined) {
    if (!Array.isArray(heads) || heads.length !== 4) errors.push(`${id}: modalityAttentionPerHead must be 4×3×3`);
  }

  warnBiology(id, data);
}

if (warnings.length) {
  console.warn(`check:cases warnings (${warnings.length})`);
  warnings.forEach((line) => console.warn(`  ${line}`));
}
if (errors.length) {
  console.error(`check:cases FAIL (${errors.length})`);
  errors.forEach((line) => console.error(`  ${line}`));
  process.exit(1);
}
console.log(`check:cases PASS (${listed.length} cases)`);

function warnBiology(id: string, data: Record<string, unknown>) {
  const pred = asRecord(data.pred);
  const ihc = asRecord(data.ihc);
  const genes = Array.isArray(data.genes) ? data.genes : [];
  const pairs: Array<[string, string]> = [
    ["ESR1", "ER"],
    ["PGR", "PR"],
    ["ERBB2", "HER2"],
  ];
  for (const [symbol, receptor] of pairs) {
    // SYN-04 keeps a deliberate PR disagreement between the stored call and IHC.
    // The gene-versus-probability check still runs for other receptors.
    if (id === "SYN-04" && receptor === "PR") continue;
    const gene = genes.find((item) => asRecord(item)?.symbol === symbol);
    const z = asRecord(gene)?.z;
    const probability = pred?.[receptor];
    if (typeof z !== "number" || typeof probability !== "number") continue;
    if (z > 0.5 && probability < 0.5) warnings.push(`${id}: ${symbol} z=${z} but ${receptor} pred=${probability} < 0.5`);
    if (z < -0.5 && probability >= 0.5) warnings.push(`${id}: ${symbol} z=${z} but ${receptor} pred=${probability} ≥ 0.5`);
  }
  const clinical = asRecord(data.clinical);
  const histology = typeof clinical?.histology === "string" ? clinical.histology.toLowerCase() : "";
  if (histology.includes("lobular")) {
    if (ihc?.ER === 0) warnings.push(`${id}: lobular histology with ER− IHC`);
    if (ihc?.HER2 === 1) warnings.push(`${id}: lobular histology with HER2+ IHC`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
