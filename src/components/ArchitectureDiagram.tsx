import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tex } from "./Tex";

type Tone = "gt" | "gene" | "wsi" | "fuse" | "model";

interface ArchNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  tone: Tone;
  lines: [string, string];
  tex: string;
  dashed?: boolean;
}

const TONE: Record<Tone, string> = {
  gt: "#F5B84B",
  gene: "#3EE0B0",
  wsi: "#FF5FA2",
  fuse: "#7C5CFF",
  model: "#FF5A5F",
};

const NODES: ArchNode[] = [
  {
    id: "clinical",
    x: 16,
    y: 20,
    w: 160,
    h: 54,
    title: "Clinical",
    sub: "median · Unknown · one-hot",
    tone: "gt",
    lines: [
      "Clinical preprocessing uses median imputation, an Unknown category, and one-hot encoding.",
      "The MLP widths are d → 128 → 64.",
    ],
    tex: String.raw`h_c=\mathrm{MLP}_{d\rightarrow 128\rightarrow 64}(x_c)`,
  },
  {
    id: "cmlp",
    x: 214,
    y: 20,
    w: 180,
    h: 54,
    title: "2-layer MLP",
    sub: "d → 128 → 64",
    tone: "gt",
    lines: [
      "This is the clinical encoder output: one 64-d token.",
      "It later sits in the first row of S.",
    ],
    tex: String.raw`h_c\in\mathbb{R}^{64}`,
  },
  {
    id: "gene",
    x: 16,
    y: 96,
    w: 160,
    h: 54,
    title: "Gene expression",
    sub: "variance 5,000 → MI → z",
    tone: "gene",
    lines: [
      "Start with the 5,000 most variable genes, select by mutual information, then standardise.",
      "Selection and standardisation are fit inside each training fold.",
    ],
    tex: String.raw`x_g\in\mathbb{R}^{5000}`,
  },
  {
    id: "gmlp",
    x: 214,
    y: 96,
    w: 180,
    h: 54,
    title: "3-layer MLP",
    sub: "d → 256 → 128 → 64",
    tone: "gene",
    lines: [
      "A three-layer MLP maps the selected genes to a 64-d token.",
      "That token is the second row of S.",
    ],
    tex: String.raw`h_g=\mathrm{MLP}_{d\rightarrow 256\rightarrow 128\rightarrow 64}(x_g)`,
  },
  {
    id: "wsi",
    x: 16,
    y: 184,
    w: 120,
    h: 64,
    title: "WSI tiles",
    sub: "tiling · ≤512",
    tone: "wsi",
    lines: [
      "Tissue regions are tiled and capped at 512 tiles per slide.",
      "The browser replays stored outputs and does not perform tiling or encoding.",
    ],
    tex: String.raw`K\le 512`,
  },
  {
    id: "uni",
    x: 154,
    y: 184,
    w: 164,
    h: 64,
    title: "UNI2-h",
    sub: "frozen · offline",
    tone: "wsi",
    dashed: true,
    lines: [
      "Frozen UNI2-h runs offline before replay and embeds each tile as 1536-d.",
      "The dashed border marks this frozen component; trained study layers use solid borders.",
    ],
    tex: String.raw`X_w=\mathrm{UNI2h}(\mathrm{tiles})\in\mathbb{R}^{K\times1536}`,
  },
  {
    id: "proj",
    x: 336,
    y: 190,
    w: 154,
    h: 54,
    title: "Linear + LN",
    sub: "1536 → 512 · GELU",
    tone: "wsi",
    lines: [
      "A linear layer, layer-norm and GELU reduce each tile to 512-d.",
      "The Transformer then attends over that sequence.",
    ],
    tex: String.raw`z_i=\mathrm{GELU}(\mathrm{LN}(Wx_i+b))`,
  },
  {
    id: "tx",
    x: 508,
    y: 176,
    w: 178,
    h: 72,
    title: "Transformer",
    sub: "[CLS] · 4 × 8 heads",
    tone: "wsi",
    lines: [
      "A learned [CLS] token is prepended to the tile sequence.",
      "Four pre-norm Transformer layers use eight heads.",
    ],
    tex: String.raw`H=\mathrm{Transformer}_{4,8}([\mathrm{CLS};z_1,\ldots,z_K])`,
  },
  {
    id: "pool",
    x: 704,
    y: 184,
    w: 140,
    h: 58,
    title: "Pool → 64-d",
    sub: "[CLS] ‖ ABMIL",
    tone: "wsi",
    lines: [
      "The slide token concatenates the [CLS] readout with gated attention pooling, then projects to 64-d.",
      "The gate is the ABMIL form: a tanh branch times a sigmoid branch.",
    ],
    tex: String.raw`a_i\propto\exp\{w^\top(\tanh(Vh_i)\odot\sigma(Uh_i))\}`,
  },
  {
    id: "fuse",
    x: 250,
    y: 320,
    w: 270,
    h: 68,
    title: "Modality self-attention",
    sub: "4 heads · residual + LN",
    tone: "fuse",
    lines: [
      "Three 64-d tokens form S. Four-head self-attention with a residual and layer-norm mixes them.",
      "Flattening T produces the 192-d fused vector.",
    ],
    tex: String.raw`S\in\mathbb{R}^{3\times 64},\; T=\mathrm{LN}(\mathrm{MHA}(S,S,S)+S),\; f\in\mathbb{R}^{192}`,
  },
  {
    id: "trunk",
    x: 560,
    y: 326,
    w: 190,
    h: 56,
    title: "Shared trunk",
    sub: "192 → 128 → 64 → 32",
    tone: "fuse",
    lines: [
      "One MLP is shared by ER, PR and HER2.",
      "The widths run 192, 128, 64, then 32.",
    ],
    tex: String.raw`u=\mathrm{MLP}_{192\rightarrow 128\rightarrow 64\rightarrow 32}(f)`,
  },
  {
    id: "er",
    x: 790,
    y: 292,
    w: 200,
    h: 44,
    title: "ER head",
    sub: "linear · sigmoid",
    tone: "model",
    lines: [
      "A linear layer and a sigmoid produce the ER probability.",
      "The head is trained with focal loss. The explorer default is γ = 2.",
    ],
    tex: String.raw`\hat{y}_{\mathrm{ER}}=\sigma(w_{\mathrm{ER}}^\top u+b_{\mathrm{ER}})`,
  },
  {
    id: "pr",
    x: 790,
    y: 346,
    w: 200,
    h: 44,
    title: "PR head",
    sub: "linear · sigmoid",
    tone: "model",
    lines: [
      "PR uses the same linear-head form as ER.",
      "It is also trained with focal loss.",
    ],
    tex: String.raw`\hat{y}_{\mathrm{PR}}=\sigma(w_{\mathrm{PR}}^\top u+b_{\mathrm{PR}})`,
  },
  {
    id: "her2",
    x: 790,
    y: 400,
    w: 200,
    h: 44,
    title: "HER2 head",
    sub: "nonlinear · sigmoid",
    tone: "model",
    lines: [
      "HER2 uses a nonlinear head and a sigmoid. Hidden widths are not listed here.",
      "Negatives use asymmetric loss. The explorer defaults γ⁻ to 3.5 and fixes γ⁺ at 1. The margin is illustrative.",
    ],
    tex: String.raw`\hat{y}_{\mathrm{HER2}}=\sigma(\mathrm{MLP}(u))`,
  },
];

const EDGES: [string, string][] = [
  ["clinical", "cmlp"],
  ["cmlp", "fuse"],
  ["gene", "gmlp"],
  ["gmlp", "fuse"],
  ["wsi", "uni"],
  ["uni", "proj"],
  ["proj", "tx"],
  ["tx", "pool"],
  ["pool", "fuse"],
  ["fuse", "trunk"],
  ["trunk", "er"],
  ["trunk", "pr"],
  ["trunk", "her2"],
];

function nodeById(id: string) {
  const node = NODES.find((item) => item.id === id);
  if (!node) throw new Error(id);
  return node;
}

function edgePath(fromId: string, toId: string) {
  const from = nodeById(fromId);
  const to = nodeById(toId);
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  if (Math.abs(y1 - y2) < 6) return `M ${x1} ${y1} H ${x2}`;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

export function ArchitectureDiagram() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = NODES.find((node) => node.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <div>
      <div className="panel max-w-full min-w-0 overflow-x-auto p-3">
        <svg viewBox="0 0 1010 470" className="h-auto min-w-[860px] w-full" role="group" aria-label="Model architecture">
          <defs>
            <marker id="arch-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 Z" fill="rgba(255,255,255,0.55)" />
            </marker>
          </defs>
          {EDGES.map(([from, to]) => (
            <path
              key={`${from}-${to}`}
              d={edgePath(from, to)}
              fill="none"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.4"
              className="flow-line"
              markerEnd="url(#arch-arrow)"
            />
          ))}
          {NODES.map((node) => {
            const color = TONE[node.tone];
            const active = node.id === selectedId || node.id === hoverId;
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={node.title}
                className="cursor-pointer outline-none"
                onClick={() => setSelectedId(node.id)}
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId(null)}
                onFocus={() => setHoverId(node.id)}
                onBlur={() => setHoverId(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(node.id);
                  }
                }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  rx="12"
                  fill="#111118"
                  stroke={color}
                  strokeWidth={active ? 2.4 : 1.2}
                  strokeDasharray={node.dashed ? "7 5" : undefined}
                  className={active ? "node-glow" : undefined}
                  style={{ color }}
                />
                <text x={node.x + 12} y={node.y + 22} fill={color} fontSize="13" fontFamily="JetBrains Mono, monospace" fontWeight="700">
                  {node.title}
                </text>
                <text x={node.x + 12} y={node.y + 40} fill="rgba(255,255,255,0.72)" fontSize="11" fontFamily="JetBrains Mono, monospace">
                  {node.sub}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 font-mono text-[11px] text-white/40">Select a block for its equation.</p>
      {selected
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <button type="button" className="absolute inset-0 bg-black/55" aria-label="Close explanation" onClick={() => setSelectedId(null)} />
              <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="arch-title"
                className="absolute right-0 bottom-0 left-0 max-h-[78vh] overflow-y-auto border border-white/10 bg-panel p-5 shadow-2xl min-[901px]:top-0 min-[901px]:bottom-0 min-[901px]:left-auto min-[901px]:w-[420px] min-[901px]:max-h-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 id="arch-title" className="font-mono text-lg font-bold" style={{ color: TONE[selected.tone] }}>
                    {selected.title}
                  </h3>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="rounded-full border border-white/15 px-3 py-1 font-mono text-[12px] text-white/80 hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-white/85">{selected.lines[0]}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-white/85">{selected.lines[1]}</p>
                <div className="mt-4 rounded-[14px] border border-white/10 bg-black/40 px-3 py-2">
                  <Tex tex={selected.tex} />
                </div>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
