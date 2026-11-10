#!/usr/bin/env python3
"""Sample TCGA-3C-AALI expression values for the grey strip on presentation slide 3.

Usage:
    python tools/gene_strip.py --matrix ~/Downloads/TCGA.BRCA.sampleMap_HiSeqV2

Reads the UCSC Xena TCGA-BRCA HiSeqV2 matrix (log2(norm_count+1), genes x samples) and writes
presentation/assets/gene_strip.json: N genes evenly spaced in file order, values for sample -01,
plus the landmark genes (value, rank among all genes of this sample, file position).
Then run tools/embed_presentation_assets.py to inline the result into presentation/index.html.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "presentation" / "assets" / "gene_strip.json"
SAMPLE = "TCGA-3C-AALI-01"
LANDMARKS = ["ESR1", "PGR", "ERBB2", "GATA3"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--matrix", type=Path, default=Path.home() / "Downloads" / "TCGA.BRCA.sampleMap_HiSeqV2")
    ap.add_argument("-n", type=int, default=220)
    args = ap.parse_args()

    with args.matrix.open() as f:
        header = f.readline().rstrip("\n").split("\t")
        col = header.index(SAMPLE)
        rows = [line.rstrip("\n").split("\t") for line in f]
    step = len(rows) / args.n
    picked = [rows[int(i * step)] for i in range(args.n)]

    values = {r[0]: float(r[col]) for r in rows}
    position = {r[0]: i for i, r in enumerate(rows)}
    landmarks = []
    for gene in LANDMARKS:
        if gene not in values:
            print(f"warning: {gene} not found in {args.matrix.name}; its callout is omitted", file=sys.stderr)
            continue
        v = values[gene]
        landmarks.append({
            "gene": gene,
            "log2": round(v, 2),
            # 1 = highest-expressed gene in this sample; ties share the better rank
            "rank": 1 + sum(1 for x in values.values() if x > v),
            "file_index": position[gene],
        })

    data = {
        "sample": SAMPLE,
        "source": "UCSC Xena TCGA.BRCA.sampleMap/HiSeqV2, log2(norm_count+1)",
        "column": SAMPLE,
        "genes_total": len(rows),
        "genes": [r[0] for r in picked],
        "values": [round(float(r[col]), 2) for r in picked],
        "file_index": [int(i * step) for i in range(args.n)],
        "landmarks": landmarks,
    }
    OUT.write_text(json.dumps(data))
    print(f"wrote {OUT} ({args.n} of {len(rows)} genes, {len(landmarks)} landmarks)")
    for lm in landmarks:
        print(f"  {lm['gene']}: log2 = {lm['log2']:.2f}, rank {lm['rank']} of {len(rows)}")


if __name__ == "__main__":
    main()
