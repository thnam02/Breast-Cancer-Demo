# ReceptorLens

Replay-only demo for the IUKM 2026 breast-cancer receptor model. The browser never runs the network. Per-patient numbers come from `public/cases/<id>/case.json`.

## Exporting real cases

`tools/export_case.py` is for the research repo. It is not imported by the site.

1. Point the `TODO` imports at the trained `ReceptorLens` class and the patient loader (`x_clin`, `x_gene`, `x_wsi` of shape K×1536, tile coordinates, the clinical record, and IHC labels).
2. Confirm the forward-hook paths. The placeholders are `model.clin_mlp`, `model.gene_mlp`, `model.fusion`, `model.trunk`, and `model.her2_head`. Fusion must be `nn.MultiheadAttention` with `need_weights=True` and `average_attn_weights=False` so the weights arrive as 4×3×3. Also capture the 64-d tokens `e_c`, `e_g`, `e_w` and the gated-attention tile weights `a_k`.
3. Run:

```bash
python tools/export_case.py --checkpoint runs/best.pt --case-id TCGA-AR-A1AR --cohort TCGA-BRCA
```

The script writes `public/cases/<caseId>/case.json`, a `thumb.jpg` at least 2048 px wide, and the top-6 tile crops in `tiles/1.jpg` … `tiles/6.jpg`. Add the id to `public/cases/index.json`. Leave `mock` unset so the MOCK DATA chip stays hidden. Do not write a per-case mutual-information field.

If a synthetic case is missing tokens, tile embeddings, activations, or per-head attention, the site fills them with a deterministic seed of `caseId` and marks those pictures illustrative. A real export that includes the blocks is shown as measured output.
