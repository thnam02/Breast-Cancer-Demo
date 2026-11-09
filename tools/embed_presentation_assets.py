#!/usr/bin/env python3
"""Inline presentation/assets (images, gene strip) and Inter fonts into presentation/index.html.

Rewrites the blocks between the ASSETS / FONTS markers so the page stays a single self-contained
file (data: URLs also keep the tissue-mask canvas readable when opened from file://).
"""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "presentation" / "index.html"
ASSETS = ROOT / "presentation" / "assets"
FONTS = ROOT / "node_modules" / "@fontsource" / "inter" / "files"
IMAGES = ["he", "heat", "t1", "t2", "t3", "t4", "t5", "t6"]
WEIGHTS = [400, 500, 600, 700, 800]


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def replace_block(html: str, name: str, body: str) -> str:
    pattern = re.compile(rf"(/\*{name}:BEGIN\*/).*?(/\*{name}:END\*/)", re.S)
    if not pattern.search(html):
        raise SystemExit(f"marker {name} not found in {HTML}")
    return pattern.sub(lambda m: m.group(1) + "\n" + body + "\n" + m.group(2), html)


def main() -> None:
    assets = {name: "data:image/jpeg;base64," + b64(ASSETS / f"{name}.jpg") for name in IMAGES}
    strip = ASSETS / "gene_strip.json"
    if strip.exists():
        assets["geneStrip"] = json.loads(strip.read_text())
    js = "window.ASSETS = " + json.dumps(assets, separators=(",", ":")) + ";"

    faces = []
    for w in WEIGHTS:
        for style in ("normal", "italic"):
            f = FONTS / f"inter-latin-{w}-{style}.woff2"
            if f.exists():
                faces.append(
                    "@font-face{font-family:'Inter';font-style:%s;font-weight:%d;font-display:block;"
                    "src:url(data:font/woff2;base64,%s) format('woff2');}" % (style, w, b64(f))
                )

    html = HTML.read_text()
    html = replace_block(html, "ASSETS", js)
    html = replace_block(html, "FONTS", "\n".join(faces))
    HTML.write_text(html)
    print(f"embedded {len(IMAGES)} images, {len(faces)} font faces -> {HTML} ({HTML.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
