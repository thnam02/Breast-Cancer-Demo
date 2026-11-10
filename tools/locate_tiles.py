#!/usr/bin/env python3
"""Locate the six top-attention tiles (assets/t1–t6.jpg) on he.jpg by matching them against the original slide.

Usage:
    python tools/locate_tiles.py --svs ~/data/TCGA-3C-AALI-01Z-00-DX1.svs

1. he.jpg is registered to the slide thumbnail (multi-scale TM_CCOEFF_NORMED) to get the level-0 → he.jpg mapping.
2. Each tile is matched on the coarsest level where a 512-px tile is still >= 32 px, then refined on a finer level
   around the best candidates. Only matches with score >= --min-score are marked accepted.
3. --heat-regions writes the fallback instead: the 6 hottest cells of heat.jpg as un-numbered approximate regions.
Writes presentation/assets/top_tiles.json; then run tools/embed_presentation_assets.py.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "presentation" / "assets"
# Gallery weights shown on the slide: #1 is stated in paper Fig. 5, #2–#6 are read from the Fig. 5D bar heights.
FIG5D_WEIGHTS = [0.00139, 0.00138, 0.00137, 0.00136, 0.00135, 0.00135]
TILE_SIZES = (448, 512, 576, 1024)   # level-0 tile side to try; 512 px at 40x is the pipeline setting


def bgr(path: Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"cannot read {path}")
    return img


def level_for(slide, max_down: float) -> int:
    ok = [i for i, d in enumerate(slide.level_downsamples) if d <= max_down + 1e-6]
    return max(ok, key=lambda i: slide.level_downsamples[i])


def read(slide, level: int, x0: int = 0, y0: int = 0, w: int | None = None, h: int | None = None) -> np.ndarray:
    lw, lh = slide.level_dimensions[level]
    w, h = w or lw, h or lh
    rgba = np.asarray(slide.read_region((x0, y0), level, (w, h)))
    rgb = rgba[..., :3].copy()
    rgb[rgba[..., 3] == 0] = 255   # transparent padding outside the scanned area reads as white glass
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def register_he(slide, he: np.ndarray) -> dict:
    """Find where he.jpg sits on the slide: he pixel (u, v) -> level-0 (ox + u * k, oy + v * k)."""
    thumb_w = 1600
    th = cv2.cvtColor(np.asarray(slide.get_thumbnail((thumb_w, thumb_w))), cv2.COLOR_RGB2BGR)
    down = slide.dimensions[0] / th.shape[1]
    best = None
    for frac in np.linspace(0.55, 1.0, 46):
        tw = int(round(th.shape[1] * frac))
        th_h = int(round(he.shape[0] * tw / he.shape[1]))
        if th_h > th.shape[0]:
            continue
        t = cv2.resize(he, (tw, th_h), interpolation=cv2.INTER_AREA)
        res = cv2.matchTemplate(th, t, cv2.TM_CCOEFF_NORMED)
        _, score, _, loc = cv2.minMaxLoc(res)
        if not best or score > best["score"]:
            best = {"score": float(score), "k": tw / he.shape[1], "loc": loc}
    k = down * best["k"]                     # level-0 px per he.jpg px (he px → thumb px → level-0 px)
    return {"score": round(best["score"], 4), "level0_per_he_px": k,
            "offset_level0": [best["loc"][0] * down, best["loc"][1] * down]}


def match_tile(slide, tile: np.ndarray, coarse: int, fine: int, coarse_img: np.ndarray) -> dict:
    dc, df = slide.level_downsamples[coarse], slide.level_downsamples[fine]
    cands = []
    for size in TILE_SIZES:
        n = int(round(size / dc))
        if n < 32 and size == 512:
            raise SystemExit(f"coarse level {coarse} too coarse: a 512-px tile is {n} px")
        if n < 8:
            continue
        res = cv2.matchTemplate(coarse_img, cv2.resize(tile, (n, n), interpolation=cv2.INTER_AREA), cv2.TM_CCOEFF_NORMED)
        for _ in range(4):                   # a few separated peaks per scale
            _, s, _, (x, y) = cv2.minMaxLoc(res)
            cands.append((float(s), size, x * dc, y * dc))
            cv2.rectangle(res, (x - n, y - n), (x + n, y + n), -1.0, -1)
    # Refine on the fine level: shrink the slide window to the tile image's own resolution (rather than enlarging
    # the tile) and try a few sizes around the coarse hit; the figure crops trim a few pixels of each 512 tile.
    best = {"score": -1.0}
    t_px = tile.shape[1]
    tile_g = cv2.cvtColor(tile, cv2.COLOR_BGR2GRAY)
    for _, size, X, Y in sorted(cands, reverse=True)[:8]:
        pad = size // 2
        x0, y0 = int(max(0, X - pad)), int(max(0, Y - pad))
        win = read(slide, fine, x0, y0, int((size + 2 * pad) / df), int((size + 2 * pad) / df))
        for s_try in range(size - 32, size + 33, 8):
            f = t_px / (s_try / df)
            w2 = cv2.resize(win, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
            if w2.shape[0] < t_px or w2.shape[1] < t_px:
                continue
            for mode, a, b in (("gray", cv2.cvtColor(w2, cv2.COLOR_BGR2GRAY), tile_g), ("rgb", w2, tile)):
                res = cv2.matchTemplate(a, b, cv2.TM_CCOEFF_NORMED)
                _, s, _, (x, y) = cv2.minMaxLoc(res)
                if s > best["score"]:
                    best = {"score": float(s), "size": s_try, "mode": mode, "x0": x0 + x / f * df, "y0": y0 + y / f * df}
    return best


def heat_regions(n: int = 6, cell: int = 18) -> list[dict]:
    """Fallback: the n hottest grid cells of heat.jpg (red, saturated), at least two cells apart."""
    heat = cv2.cvtColor(bgr(ASSETS / "heat.jpg"), cv2.COLOR_BGR2HSV).astype(np.float32)
    hue, sat, val = heat[..., 0], heat[..., 1] / 255, heat[..., 2] / 255
    # jet-like map: red/orange (hue < 20 or > 170 on OpenCV's 0–180 scale) is hot
    hot = ((hue < 20) | (hue > 170)) * sat * val
    rows, cols = hot.shape[0] // cell, hot.shape[1] // cell
    score = hot[: rows * cell, : cols * cell].reshape(rows, cell, cols, cell).mean(axis=(1, 3))
    picks = []
    for idx in np.argsort(-score, axis=None):
        r, c = divmod(int(idx), cols)
        if all(abs(r - pr) > 2 or abs(c - pc) > 2 for pr, pc in picks):
            picks.append((r, c))
        if len(picks) == n:
            break
    return [{"rank": None, "x": c * cell, "y": r * cell, "w": cell, "h": cell, "weight": None,
             "source": "approximate", "heat_score": round(float(score[r, c]), 4)} for r, c in picks]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--svs", type=Path, nargs="*", default=[])
    ap.add_argument("--min-score", type=float, default=0.8)
    ap.add_argument("--heat-regions", action="store_true", help="write the approximate fallback instead")
    ap.add_argument("--out", type=Path, default=ASSETS / "top_tiles.json")
    args = ap.parse_args()

    if args.heat_regions:
        args.out.write_text(json.dumps(heat_regions(), indent=1))
        print(f"wrote {args.out}: 6 approximate high-attention regions from heat.jpg")
        return

    import openslide
    he = bgr(ASSETS / "he.jpg")
    tiles = [bgr(ASSETS / f"t{i}.jpg") for i in range(1, 7)]
    best_run = None
    for svs in args.svs:
        slide = openslide.OpenSlide(str(svs))
        reg = register_he(slide, he)
        print(f"{svs.name}: {slide.dimensions}, downsamples {[round(d, 1) for d in slide.level_downsamples]}, "
              f"he.jpg registration score {reg['score']}")
        coarse = level_for(slide, 512 / 32)
        fine = level_for(slide, 1)
        coarse_img = read(slide, coarse)
        k, (ox, oy) = reg["level0_per_he_px"], reg["offset_level0"]
        out = []
        for i, t in enumerate(tiles):
            m = match_tile(slide, t, coarse, fine, coarse_img)
            ok = m["score"] >= args.min_score
            print(f"  t{i + 1}: score {m['score']:.3f} ({m['mode']}) size {m['size']} at level-0 ({m['x0']:.0f}, {m['y0']:.0f})"
                  + ("" if ok else "  (rejected)"))
            out.append({
                "rank": i + 1,
                "x": round((m["x0"] - ox) / k, 2), "y": round((m["y0"] - oy) / k, 2),
                "w": round(m["size"] / k, 2), "h": round(m["size"] / k, 2),
                "weight": FIG5D_WEIGHTS[i], "weight_source": "paper Fig. 5D",
                "source": "template_match" if ok else "template_match_rejected",
                "score": round(m["score"], 4), "match_mode": m["mode"],
                "slide": svs.name, "level0": [round(m["x0"]), round(m["y0"]), m["size"]],
                "coarse_level_tile_px": round(512 / slide.level_downsamples[coarse], 1),
                "he_registration_score": reg["score"],
            })
        total = sum(o["score"] for o in out)
        if not best_run or total > best_run[0]:
            best_run = (total, out)
    if not best_run:
        raise SystemExit("no slide given; use --svs or --heat-regions")
    out = best_run[1]
    accepted = sum(o["source"] == "template_match" for o in out)
    if accepted == 0:
        print("no tile reached the minimum score; writing the approximate heat-map fallback", file=sys.stderr)
        out = heat_regions()
    args.out.write_text(json.dumps(out, indent=1))
    print(f"wrote {args.out}: {accepted} of 6 tiles accepted (score >= {args.min_score})")


if __name__ == "__main__":
    main()
