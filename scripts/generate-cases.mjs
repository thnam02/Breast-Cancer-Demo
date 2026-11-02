import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const WIDTH = 1280;
const HEIGHT = 896;
const TILE = 64;
const ROOT = path.resolve("public/cases");
const LEGACY_CASE_IDS = ["MOCK-3C-AALI", "MOCK-A2-A04P", "MOCK-BH-A18Q", "MOCK-E9-A1NH"];

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTiles(caseId, tight = false) {
  const rng = mulberry32(hashString(`${caseId}:tiles`));
  const blobCount = tight ? 2 : 3 + Math.floor(rng() * 3);
  const blobs = Array.from({ length: blobCount }, () => ({
    x: WIDTH * (0.18 + rng() * 0.64),
    y: HEIGHT * (0.18 + rng() * 0.64),
    rx: tight ? 70 + rng() * 90 : 110 + rng() * 190,
    ry: tight ? 55 + rng() * 70 : 80 + rng() * 150,
  }));

  const tiles = [];
  for (let y = 0; y < HEIGHT; y += TILE) {
    for (let x = 0; x < WIDTH; x += TILE) {
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;
      let field = 0;
      for (const blob of blobs) {
        const dx = (cx - blob.x) / blob.rx;
        const dy = (cy - blob.y) / blob.ry;
        field += Math.exp(-2.15 * (dx * dx + dy * dy));
      }
      const noisy = field * (0.82 + rng() * 0.36);
      const raw = tight ? noisy ** 2.4 : 0.012 + noisy ** 1.45;
      tiles.push({ x, y, w: TILE, h: TILE, raw });
    }
  }

  const sum = tiles.reduce((total, tile) => total + tile.raw, 0);
  return tiles.map((tile) => ({
    x: tile.x,
    y: tile.y,
    w: tile.w,
    h: tile.h,
    attn: tile.raw / sum,
  }));
}

const MOCK_NOTE =
  "SYNTHETIC MOCK CASE. Not a real patient and not a TCGA record. Clinical fields, predictions, modality attention, and gene z-scores are placeholders so the viewer can replay. Replace case.json with a real export, omit mock and mockNote, add thumb.jpg plus optional tiles/*.jpg or a DZI, and list the id in index.json.";

const CASES = [
  {
    caseId: "SYN-01",
    cohort: "Synthetic",
    descriptor: "Modelled on the paper's case study (synthetic values)",
    mock: true,
    mockNote: MOCK_NOTE,
    clinical: {
      age: 50,
      sex: "F",
      side: "Right",
      histology: "Invasive ductal carcinoma",
      stage: "IIB",
      tnm: "pT2N1aM0",
    },
    ihc: { ER: 1, PR: 1, HER2: 1 },
    pred: { ER: 0.914, PR: 0.862, HER2: 0.781 },
    slide: { thumb: "thumb.jpg", width: WIDTH, height: HEIGHT, dzi: null },
    modalityAttention: [
      [0.58, 0.27, 0.15],
      [0.22, 0.55, 0.23],
      [0.14, 0.31, 0.55],
    ],
    genes: [
      { symbol: "ESR1", z: 1.8, receptor: "ER" },
      { symbol: "GATA3", z: 1.4, receptor: "ER" },
      { symbol: "AGR3", z: 1.1, receptor: "ER" },
      { symbol: "PGR", z: 1.5, receptor: "PR" },
      { symbol: "CA12", z: 0.9, receptor: "PR" },
      { symbol: "ERBB2", z: 1.6, receptor: "HER2" },
      { symbol: "GRB7", z: 1.2, receptor: "HER2" },
      { symbol: "TCAP", z: 0.7, receptor: "HER2" },
    ],
  },
  {
    caseId: "SYN-02",
    cohort: "Synthetic",
    descriptor: "Synthetic case 2",
    mock: true,
    mockNote: MOCK_NOTE,
    clinical: {
      age: 62,
      sex: "F",
      side: "Left",
      histology: "Invasive lobular carcinoma",
      stage: "IIA",
      tnm: "pT2N0M0",
    },
    ihc: { ER: 1, PR: 1, HER2: 0 },
    pred: { ER: 0.947, PR: 0.804, HER2: 0.176 },
    slide: { thumb: "thumb.jpg", width: WIDTH, height: HEIGHT, dzi: null },
    modalityAttention: [
      [0.41, 0.44, 0.15],
      [0.19, 0.63, 0.18],
      [0.16, 0.46, 0.38],
    ],
    genes: [
      { symbol: "ESR1", z: 2.1, receptor: "ER" },
      { symbol: "GATA3", z: 1.6, receptor: "ER" },
      { symbol: "AGR3", z: 0.8, receptor: "ER" },
      { symbol: "PGR", z: 1.3, receptor: "PR" },
      { symbol: "CA12", z: 1.0, receptor: "PR" },
      { symbol: "ERBB2", z: -0.6, receptor: "HER2" },
      { symbol: "GRB7", z: -0.4, receptor: "HER2" },
      { symbol: "TCAP", z: -0.2, receptor: "HER2" },
    ],
  },
  {
    caseId: "SYN-03",
    cohort: "Synthetic",
    descriptor: "Synthetic case 3",
    mock: true,
    mockNote: MOCK_NOTE,
    clinical: {
      age: 44,
      sex: "F",
      side: "Left",
      histology: "Invasive ductal carcinoma (NST)",
      stage: "IIIA",
      tnm: "pT3N1aM0",
    },
    ihc: { ER: 0, PR: 0, HER2: 1 },
    pred: { ER: 0.118, PR: 0.207, HER2: 0.836 },
    slide: { thumb: "thumb.jpg", width: WIDTH, height: HEIGHT, dzi: null },
    modalityAttention: [
      [0.52, 0.18, 0.3],
      [0.14, 0.47, 0.39],
      [0.11, 0.24, 0.65],
    ],
    genes: [
      { symbol: "ESR1", z: -1.1, receptor: "ER" },
      { symbol: "GATA3", z: -0.7, receptor: "ER" },
      { symbol: "AGR3", z: -0.4, receptor: "ER" },
      { symbol: "PGR", z: -0.9, receptor: "PR" },
      { symbol: "CA12", z: -0.3, receptor: "PR" },
      { symbol: "ERBB2", z: 2.2, receptor: "HER2" },
      { symbol: "GRB7", z: 1.8, receptor: "HER2" },
      { symbol: "TCAP", z: 1.1, receptor: "HER2" },
    ],
  },
  {
    caseId: "SYN-04",
    cohort: "Synthetic",
    descriptor: "Synthetic case 4 · intended PR discordance",
    mock: true,
    mockNote: MOCK_NOTE,
    clinical: {
      age: 71,
      sex: "F",
      side: "Right",
      histology: "Invasive ductal carcinoma",
      stage: "IA",
      tnm: "pT1cN0M0",
    },
    ihc: { ER: 1, PR: 0, HER2: 0 },
    pred: { ER: 0.881, PR: 0.64, HER2: 0.094 },
    slide: { thumb: "thumb.jpg", width: WIDTH, height: HEIGHT, dzi: null },
    modalityAttention: [
      [0.49, 0.33, 0.18],
      [0.28, 0.51, 0.21],
      [0.17, 0.29, 0.54],
    ],
    genes: [
      { symbol: "ESR1", z: 1.2, receptor: "ER" },
      { symbol: "GATA3", z: 0.6, receptor: "ER" },
      { symbol: "AGR3", z: 0.4, receptor: "ER" },
      { symbol: "PGR", z: 0.8, receptor: "PR" },
      { symbol: "CA12", z: 0.3, receptor: "PR" },
      { symbol: "ERBB2", z: -0.8, receptor: "HER2" },
      { symbol: "GRB7", z: -0.5, receptor: "HER2" },
      { symbol: "TCAP", z: -0.3, receptor: "HER2" },
    ],
  },
  {
    caseId: "SYN-05",
    cohort: "Synthetic",
    descriptor: "Synthetic case 5",
    mock: true,
    mockNote: MOCK_NOTE,
    tight: true,
    clinical: {
      age: 39,
      sex: "F",
      side: "Left",
      histology: "Invasive ductal carcinoma (NST)",
      stage: "IIA",
      tnm: "pT2N0M0",
    },
    ihc: { ER: 0, PR: 0, HER2: 0 },
    pred: { ER: 0.071, PR: 0.058, HER2: 0.094 },
    slide: { thumb: "thumb.jpg", width: WIDTH, height: HEIGHT, dzi: null },
    modalityAttention: [
      [0.46, 0.22, 0.32],
      [0.18, 0.44, 0.38],
      [0.12, 0.27, 0.61],
    ],
    genes: [
      { symbol: "ESR1", z: -2.1, receptor: "ER" },
      { symbol: "GATA3", z: -1.5, receptor: "ER" },
      { symbol: "AGR3", z: -1.8, receptor: "ER" },
      { symbol: "PGR", z: -1.7, receptor: "PR" },
      { symbol: "CA12", z: -1.0, receptor: "PR" },
      { symbol: "ERBB2", z: -0.5, receptor: "HER2" },
      { symbol: "GRB7", z: -0.6, receptor: "HER2" },
      { symbol: "TCAP", z: -0.4, receptor: "HER2" },
    ],
  },
];

function stats(tiles) {
  const total = tiles.reduce((sum, tile) => sum + tile.attn, 0);
  const probs = tiles.map((tile) => tile.attn / total).sort((a, b) => b - a);
  const top100 = probs.slice(0, 100).reduce((sum, value) => sum + value, 0);
  const entropy = -probs.reduce((sum, prob) => sum + prob * Math.log(prob), 0);
  return { n: tiles.length, top100, entropy };
}

await mkdir(ROOT, { recursive: true });
await Promise.all(LEGACY_CASE_IDS.map((caseId) => rm(path.join(ROOT, caseId), { recursive: true, force: true })));

for (const spec of CASES) {
  const { tight, ...rest } = spec;
  const tiles = buildTiles(spec.caseId, Boolean(tight));
  const ranked = [...tiles].sort((a, b) => b.attn - a.attn);
  const topTiles = ranked.slice(0, 6).map((tile, index) => ({
    rank: index + 1,
    img: `tiles/${index + 1}.jpg`,
    attn: tile.attn,
  }));
  const file = { ...rest, tiles, topTiles };
  const dir = path.join(ROOT, spec.caseId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "case.json"), `${JSON.stringify(file, null, 2)}\n`);
  await writeFile(
    path.join(dir, "MOCK.txt"),
    "Synthetic demo case for ReceptorLens. Not a real patient.\nSwap in case.json, thumb.jpg, and optional tiles/*.jpg or a DZI.\nOmit the mock field in case.json to hide the MOCK DATA chip.\n",
  );
  const summary = stats(tiles);
  console.log(
    `${spec.caseId}  tiles=${summary.n}  top100=${summary.top100.toFixed(3)}  H=${summary.entropy.toFixed(3)} nats`,
  );
}

await writeFile(
  path.join(ROOT, "index.json"),
  `${JSON.stringify({ cases: CASES.map((item) => item.caseId) }, null, 2)}\n`,
);
