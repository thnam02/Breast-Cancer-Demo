#!/usr/bin/env python3
"""Sample TCGA-3C-AALI expression values for the grey strip on presentation slide 3.

Usage:
    python tools/gene_strip.py --matrix ~/Downloads/TCGA.BRCA.sampleMap_HiSeqV2

Reads the UCSC Xena TCGA-BRCA HiSeqV2 matrix (log2(norm_count+1), genes x samples) and writes
presentation/assets/gene_strip.json: N genes evenly spaced in file order, values for sample -01.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "presentation" / "assets" / "gene_strip.json"
SAMPLE = "TCGA-3C-AALI-01"


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
    data = {
        "sample": SAMPLE,
        "source": "UCSC Xena TCGA.BRCA.sampleMap/HiSeqV2, log2(norm_count+1)",
        "genes_total": len(rows),
        "genes": [r[0] for r in picked],
        "values": [round(float(r[col]), 2) for r in picked],
    }
    OUT.write_text(json.dumps(data))
    print(f"wrote {OUT} ({args.n} of {len(rows)} genes)")


if __name__ == "__main__":
    main()
