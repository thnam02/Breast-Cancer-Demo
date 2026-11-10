#!/usr/bin/env python3
"""Top-6 tile locations for presentation slide 4 from the model's own attention export.

Usage:
    python tools/top_tiles_from_coords.py --coords coords.npy --attn attn.npy --level0-size 98304 72192

--coords  CSV (columns x,y) or NPY (N x 2) with the level-0 top-left corner of every tile, in attention order
--attn    CSV (one value per row, or a column named attn/weight) or NPY (N) with the attention weight of every tile
Writes presentation/assets/top_tiles.json in he.jpg pixel coordinates (source "pipeline"):
    sx = he.width / level0_width, sy = he.height / level0_height
Then run tools/embed_presentation_assets.py to inline it into presentation/index.html.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "presentation" / "assets"


def load(path: Path, columns: tuple[str, ...]) -> np.ndarray:
    if path.suffix == ".npy":
        return np.load(path)
    with path.open(newline="") as f:
        rows = list(csv.reader(f))
    head = [h.strip().lower() for h in rows[0]]
    if any(c in head for c in columns):
        idx = [head.index(c) for c in columns if c in head]
        return np.array([[float(r[i]) for i in idx] for r in rows[1:]]).squeeze()
    return np.array([[float(v) for v in r] for r in rows]).squeeze()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--coords", type=Path, required=True)
    ap.add_argument("--attn", type=Path, required=True)
    ap.add_argument("--level0-size", type=int, nargs=2, metavar=("WIDTH", "HEIGHT"), required=True)
    ap.add_argument("--tile", type=int, default=512, help="tile side in level-0 pixels")
    ap.add_argument("--top", type=int, default=6)
    ap.add_argument("--he", type=Path, default=ASSETS / "he.jpg")
    ap.add_argument("--out", type=Path, default=ASSETS / "top_tiles.json")
    args = ap.parse_args()

    xy = load(args.coords, ("x", "y")).reshape(-1, 2)
    attn = load(args.attn, ("attn",)).reshape(-1)
    if len(xy) != len(attn):
        raise SystemExit(f"{len(xy)} coordinates but {len(attn)} attention weights")
    he_w, he_h = Image.open(args.he).size
    sx, sy = he_w / args.level0_size[0], he_h / args.level0_size[1]

    order = np.argsort(-attn)[: args.top]
    tiles = [{
        "rank": r + 1,
        "x": round(float(xy[i, 0]) * sx, 2), "y": round(float(xy[i, 1]) * sy, 2),
        "w": round(args.tile * sx, 2), "h": round(args.tile * sy, 2),
        "weight": float(attn[i]),
        "source": "pipeline",
    } for r, i in enumerate(order)]
    args.out.write_text(json.dumps(tiles, indent=1))
    print(f"wrote {args.out}: top {len(tiles)} of {len(attn)} tiles (sx={sx:.6f}, sy={sy:.6f})")


if __name__ == "__main__":
    main()
