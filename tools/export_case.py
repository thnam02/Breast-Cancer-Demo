#!/usr/bin/env python3
"""Export one real patient into public/cases/<caseId>/case.json.

This script belongs to the research repo. The browser demo never imports it
and never runs the model. Module names below are placeholders: point them at
the trained network before use.

Example:
  python tools/export_case.py --checkpoint runs/best.pt --case-id TCGA-AR-A1AR --split test
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

# TODO: replace with the research repo's model package.
# from receptorlens.model import ReceptorLens
# TODO: replace with the patient table / slide reader.
# from receptorlens.data import load_patient


def main() -> None:
    parser = argparse.ArgumentParser(description="Write one ReceptorLens case.json from a trained forward pass.")
    parser.add_argument("--checkpoint", required=True, help="Trained weights (.pt)")
    parser.add_argument("--case-id", required=True)
    parser.add_argument("--cohort", choices=["TCGA-BRCA", "CPTAC-BRCA"], required=True)
    parser.add_argument("--out", default="public/cases", help="Case root. Writes <out>/<caseId>/")
    parser.add_argument("--descriptor", default="", help="Neutral picker label. Leave empty to use the case id.")
    args = parser.parse_args()

    # TODO: load x_clin, x_gene, x_wsi (K, 1536), tile coords, clinical record, IHC labels.
    # patient = load_patient(args.case_id)
    # model = ReceptorLens.load(args.checkpoint).eval()
    raise SystemExit(
        "Hook names are still placeholders. Wire load_patient and ReceptorLens, then delete this guard."
    )


def capture(model, patient) -> dict:
    """Run one forward pass and collect the replay fields.

    Expected modules, once the checkpoint is wired:
      model.clin_mlp        -> clin_hidden
      model.gene_mlp        -> gene_hidden
      model.fusion          -> nn.MultiheadAttention over the 3 tokens
      model.trunk           -> trunk activations, concatenated 128 + 64 + 32
      model.her2_head       -> her2_hidden
      model.wsi_encoder     -> gated-attention weights a_k and tokens e_c, e_g, e_w
    """
    import torch
    import torch.nn as nn

    captured: dict[str, torch.Tensor] = {}

    def stash(name):
        def hook(_module, _inputs, output):
            value = output[0] if isinstance(output, tuple) else output
            captured[name] = value.detach().cpu()

        return hook

    handles = [
        # TODO: confirm these attribute paths against the trained class.
        model.clin_mlp.register_forward_hook(stash("clin_hidden")),
        model.gene_mlp.register_forward_hook(stash("gene_hidden")),
        model.fusion.register_forward_hook(stash("fusion")),
        model.trunk.register_forward_hook(stash("trunk")),
        model.her2_head.register_forward_hook(stash("her2_hidden")),
    ]
    # need_weights=True, average_attn_weights=False -> (batch, 4 heads, 3, 3)
    attention = model.fusion
    if isinstance(attention, nn.MultiheadAttention):
        attention.need_weights = True
        attention.average_attn_weights = False

    with torch.no_grad():
        # TODO: match the real forward signature.
        # pred, tokens, tile_weights = model(patient.x_clin, patient.x_gene, patient.x_wsi)
        pred = model(patient["x_clin"], patient["x_gene"], patient["x_wsi"])
    for handle in handles:
        handle.remove()

    e_c = captured["e_c"].reshape(-1)[:64]  # TODO: read the clinical token the encoder returns
    e_g = captured["e_g"].reshape(-1)[:64]
    e_w = captured["e_w"].reshape(-1)[:64]
    heads = captured["attn"].reshape(4, 3, 3)  # TODO: MultiheadAttention weights, average_attn_weights=False
    tile_weights = captured["a_k"].reshape(-1)  # gated-attention a_k, sums to 1
    x_wsi = patient["x_wsi"]  # (K, 1536)
    norms = np.linalg.norm(x_wsi, axis=1)
    pca = pca3(x_wsi)
    return {
        "pred": pred,
        "tokens": {"clinical": e_c.tolist(), "gene": e_g.tolist(), "wsi": e_w.tolist()},
        "modalityAttentionPerHead": heads.tolist(),
        "modalityAttention": heads.mean(axis=0).tolist(),
        "tile_weights": tile_weights.tolist(),
        "norm": norms.tolist(),
        "pca": pca.tolist(),
        "activations": {
            "clin_hidden": flat(captured["clin_hidden"]),
            "gene_hidden": flat(captured["gene_hidden"]),
            "trunk": flat(captured["trunk"]),
            "her2_hidden": flat(captured["her2_hidden"]),
        },
    }


def pca3(matrix: np.ndarray) -> np.ndarray:
    centered = matrix - matrix.mean(axis=0, keepdims=True)
    _u, _s, vt = np.linalg.svd(centered, full_matrices=False)
    return centered @ vt[:3].T


def flat(tensor) -> list[float]:
    return tensor.reshape(-1).tolist()


def write_case(out_root: Path, case_id: str, payload: dict, patient: dict, thumb, crops: list) -> None:
    folder = out_root / case_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "tiles").mkdir(exist_ok=True)
    document = {
        "caseId": case_id,
        "cohort": patient["cohort"],
        "descriptor": patient.get("descriptor") or case_id,
        "clinical": patient["clinical"],
        "ihc": patient["ihc"],
        "pred": payload["pred"],
        "slide": {"thumb": "thumb.jpg", "width": patient["width"], "height": patient["height"], "dzi": None},
        "tiles": patient["tiles"],
        "topTiles": patient["topTiles"],
        "modalityAttention": payload["modalityAttention"],
        "modalityAttentionPerHead": payload["modalityAttentionPerHead"],
        "genes": patient["genes"],
        "tokens": payload["tokens"],
        "tileEmbedding": {"norm": payload["norm"], "pca": payload["pca"]},
        "activations": payload["activations"],
    }
    (folder / "case.json").write_text(json.dumps(document, indent=2) + "\n")
    thumb.save(folder / "thumb.jpg", quality=92)  # ≥ 2048 px wide
    for index, crop in enumerate(crops, start=1):
        crop.save(folder / "tiles" / f"{index}.jpg", quality=92)


if __name__ == "__main__":
    main()
