import type { StepId } from "../lib/timeline";

const COLOR = {
  clinical: "#F5B84B",
  gene: "#3EE0B0",
  wsi: "#FF5FA2",
  fuse: "#7C5CFF",
  model: "#FF5A5F",
} as const;

export function MiniArchitecture({ stage }: { stage: StepId | "ready" }) {
  const hot = (id: "clinical" | "gene" | "wsi" | "mil" | "fuse" | "heads") => {
    if (stage === "patient") return id === "clinical" || id === "gene" || id === "wsi";
    if (stage === "tiles" || stage === "embed" || stage === "encoder") return id === "mil" || id === "wsi";
    if (stage === "modalities") return id === "clinical" || id === "gene";
    if (stage === "fusion") return id === "fuse";
    if (stage === "predict") return id === "heads";
    if (stage === "explain" || stage === "ready") return id === "wsi" || id === "mil";
    return false;
  };
  const ink = (id: Parameters<typeof hot>[0], color: string) => (hot(id) ? color : "rgba(255,255,255,0.3)");

  return (
    <svg viewBox="0 0 210 150" className="h-full w-full" role="img" aria-label="Active pipeline stage">
      <path className="flow-line" d="M36 30 V78 H78" fill="none" stroke={ink("clinical", COLOR.clinical)} strokeWidth="1.2" />
      <path className="flow-line" d="M105 30 V78" fill="none" stroke={ink("gene", COLOR.gene)} strokeWidth="1.2" />
      <path className="flow-line" d="M174 30 V46" fill="none" stroke={ink("wsi", COLOR.wsi)} strokeWidth="1.2" />
      <path className="flow-line" d="M174 72 V78 H132" fill="none" stroke={ink("mil", COLOR.wsi)} strokeWidth="1.2" />
      <path className="flow-line" d="M105 102 V116" fill="none" stroke={ink("fuse", COLOR.fuse)} strokeWidth="1.2" />

      {(
        [
          ["C", 36, "clinical", COLOR.clinical],
          ["G", 105, "gene", COLOR.gene],
          ["W", 174, "wsi", COLOR.wsi],
        ] as const
      ).map(([label, x, id, color]) => (
        <g key={label}>
          <circle cx={x} cy="18" r="11" fill="#07070B" stroke={ink(id, color)} strokeWidth={hot(id) ? 2 : 1} />
          <text x={x} y="21" textAnchor="middle" fill={color} fontSize="9" fontFamily="JetBrains Mono, monospace">
            {label}
          </text>
        </g>
      ))}

      <rect x="132" y="46" width="84" height="26" rx="7" fill="#07070B" stroke={ink("mil", COLOR.wsi)} strokeWidth={hot("mil") ? 2 : 1} />
      <text x="174" y="58" textAnchor="middle" fill="#fff" fontSize="8" fontFamily="JetBrains Mono, monospace">
        MIL
      </text>
      <text
        x="174"
        y="68"
        textAnchor="middle"
        fill={COLOR.wsi}
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
        className={stage === "encoder" ? "cls-pulse" : undefined}
      >
        [CLS]
      </text>

      <rect x="48" y="78" width="114" height="24" rx="7" fill="#07070B" stroke={ink("fuse", COLOR.fuse)} strokeWidth={hot("fuse") ? 2 : 1} />
      <text x="105" y="94" textAnchor="middle" fill="#fff" fontSize="8" fontFamily="JetBrains Mono, monospace">
        Self-attention
      </text>

      <rect x="58" y="116" width="94" height="22" rx="7" fill="#07070B" stroke={ink("heads", COLOR.model)} strokeWidth={hot("heads") ? 2 : 1} />
      <text x="105" y="131" textAnchor="middle" fill={COLOR.model} fontSize="8" fontFamily="JetBrains Mono, monospace">
        ER · PR · HER2
      </text>
    </svg>
  );
}
