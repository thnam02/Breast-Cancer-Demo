#!/usr/bin/env python3
"""Extract paper Fig. 5 (TCGA-3C-AALI) and crop the panels used by presentation/index.html.

Usage:
    python tools/crop_fig5.py --pdf "path/to/978-981-92-5641-9_9.pdf"

Requires poppler (`pdfimages`) and Pillow + numpy.
Writes presentation/assets/{he,heat,t1..t6}.jpg and prints an alignment report.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "presentation" / "assets"
DEFAULT_PDF = Path.home() / "Downloads" / "978-981-92-5641-9_9 (4).pdf"

FIG_SIZE = (1708, 1225)
HE_BOX = (46, 89, 751, 608)
HEAT_BOX = (888, 89, 1593, 608)
TILE = 136
TILE_ORIGINS = [(65, 732), (331, 732), (597, 732), (66, 889), (331, 889), (597, 889)]


def extract_fig5(pdf: Path, workdir: Path) -> Image.Image:
    if shutil.which("pdfimages") is None:
        sys.exit("pdfimages not found (brew install poppler)")
    subprocess.run(
        ["pdfimages", "-png", "-f", "11", "-l", "11", str(pdf), str(workdir / "p11")],
        check=True,
    )
    candidates = sorted(workdir.glob("p11-*.png"))
    for path in candidates:
        img = Image.open(path).convert("RGB")
        if img.size == FIG_SIZE:
            return img
    sizes = [Image.open(p).size for p in candidates]
    sys.exit(f"No {FIG_SIZE[0]}x{FIG_SIZE[1]} image on page 11 (found {sizes})")


# Approximate centres (on he.jpg) of the four core-biopsy holes in the dense tumour; they are
# background-coloured in both panels while the surrounding tissue / overlay is saturated.
HOLES = [(256, 220), (370, 253), (413, 276), (446, 318)]


def hole_centroids(img: Image.Image, r: int = 24) -> np.ndarray:
    a = np.asarray(img, dtype=np.int16)
    out = []
    for x, y in HOLES:
        w = a[y - r : y + r, x - r : x + r]
        m = ((w.max(axis=2) - w.min(axis=2)) < 16) & (w.mean(axis=2) > 205)
        ys, xs = np.nonzero(m)
        out.append((x - r + xs.mean(), y - r + ys.mean()))
    return np.array(out)


def offset(he: Image.Image, heat: Image.Image) -> tuple[float, float]:
    d = hole_centroids(heat) - hole_centroids(he)
    return float(d[:, 0].mean()), float(d[:, 1].mean())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    args = ap.parse_args()
    if not args.pdf.exists():
        sys.exit(f"PDF not found: {args.pdf}")

    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        fig = extract_fig5(args.pdf, Path(tmp))

    he = fig.crop(HE_BOX)
    heat = fig.crop(HEAT_BOX)
    assert he.size == heat.size, f"size mismatch {he.size} vs {heat.size}"
    dx, dy = offset(he, heat)
    print(f"heat vs he offset with spec boxes: dx={dx:+.2f} dy={dy:+.2f} px")
    sx, sy = round(dx), round(dy)
    if (sx, sy) != (0, 0):
        x0, y0, x1, y1 = HEAT_BOX
        box = (x0 + sx, y0 + sy, x1 + sx, y1 + sy)
        heat = fig.crop(box)
        dx, dy = offset(he, heat)
        print(f"heat box nudged to {box}: dx={dx:+.2f} dy={dy:+.2f} px")
    if abs(dx) >= 0.75 or abs(dy) >= 0.75:
        sys.exit("he.jpg and heat.jpg are not aligned")

    he.save(OUT / "he.jpg", quality=95, subsampling=0)
    heat.save(OUT / "heat.jpg", quality=95, subsampling=0)
    for i, (x, y) in enumerate(TILE_ORIGINS, start=1):
        tile = fig.crop((x, y, x + TILE, y + TILE)).resize((TILE * 2, TILE * 2), Image.LANCZOS)
        tile.save(OUT / f"t{i}.jpg", quality=95, subsampling=0)
    print(f"he.jpg {he.size}  heat.jpg {heat.size}  tiles {TILE * 2}x{TILE * 2}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
