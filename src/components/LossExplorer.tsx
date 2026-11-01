import { useEffect, useRef, useState } from "react";

const SAMPLES = 160;

function clip(p: number) {
  return Math.min(1 - 1e-6, Math.max(1e-6, p));
}

function crossEntropyPositive(p: number) {
  return -Math.log(clip(p));
}

function focalPositive(p: number, gamma: number) {
  const probability = clip(p);
  return (1 - probability) ** gamma * -Math.log(probability);
}

function crossEntropyNegative(p: number) {
  return -Math.log(1 - clip(p));
}

function asymmetricNegative(p: number, gammaMinus: number, margin: number) {
  const shifted = Math.max(p - margin, 0);
  if (shifted <= 1e-8) return 0;
  const probability = Math.min(shifted, 1 - 1e-6);
  return probability ** gammaMinus * -Math.log(1 - probability);
}

export function LossExplorer() {
  const [gamma, setGamma] = useState(2);
  const [gammaMinus, setGammaMinus] = useState(3.5);
  const [margin, setMargin] = useState(0);
  const [plotEpoch, setPlotEpoch] = useState(0);
  const positiveRef = useRef<HTMLCanvasElement>(null);
  const negativeRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const positive = Array.from({ length: SAMPLES }, (_, index) => 0.02 + (0.96 * index) / (SAMPLES - 1));
    drawChart(positiveRef.current, positive, [
      { color: "rgba(255,255,255,0.55)", values: positive.map(crossEntropyPositive) },
      { color: "#FF5A5F", values: positive.map((p) => focalPositive(p, gamma)) },
    ]);
  }, [gamma, plotEpoch]);

  useEffect(() => {
    const probability = Array.from({ length: SAMPLES }, (_, index) => (0.98 * index) / (SAMPLES - 1));
    drawChart(negativeRef.current, probability, [
      { color: "rgba(255,255,255,0.55)", values: probability.map(crossEntropyNegative) },
      { color: "#FF5FA2", values: probability.map((p) => asymmetricNegative(p, gammaMinus, margin)) },
    ]);
  }, [gammaMinus, margin, plotEpoch]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setPlotEpoch((value) => value + 1);
    });
    if (positiveRef.current) observer.observe(positiveRef.current);
    if (negativeRef.current) observer.observe(negativeRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <article className="panel p-4 sm:p-5">
      <h3 className="text-lg font-semibold">Loss explorer · Training only — not part of inference</h3>
      <p className="mt-1 max-w-3xl text-sm text-white/65">
        Shapes of the training losses. These curves are the functions of a predicted probability. They are not a measured result from the paper.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="font-mono text-[12px] text-model">ER / PR · focal loss</p>
          <canvas ref={positiveRef} className="mt-2 h-48 w-full" />
          <div className="mt-2 flex gap-3 font-mono text-[11px] text-white/55">
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-4 bg-white/60" /> cross-entropy
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-4 bg-model" /> focal
            </span>
          </div>
          <label className="mt-3 flex items-center gap-3 font-mono text-[12px] text-white/80">
            γ {gamma.toFixed(1)}
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={gamma}
              aria-label="Focal loss gamma"
              onChange={(event) => setGamma(Number(event.target.value))}
              className="w-full accent-[#FF5A5F]"
            />
          </label>
          <p className="mt-1 font-mono text-[10px] text-white/40">x: p of the true class · y: loss, clipped at 4</p>
        </div>
        <div>
          <p className="font-mono text-[12px] text-wsi">HER2 negative · asymmetric loss</p>
          <canvas ref={negativeRef} className="mt-2 h-48 w-full" />
          <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-white/55">
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-4 bg-white/60" /> cross-entropy
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-4 bg-wsi" /> asymmetric
            </span>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/80">γ⁺ = 1</span>
          </div>
          <label className="mt-3 flex items-center gap-3 font-mono text-[12px] text-white/80">
            γ⁻ {gammaMinus.toFixed(1)}
            <input
              type="range"
              min={0}
              max={6}
              step={0.1}
              value={gammaMinus}
              aria-label="Asymmetric loss gamma minus"
              onChange={(event) => setGammaMinus(Number(event.target.value))}
              className="w-full accent-[#FF5FA2]"
            />
          </label>
          <label className="mt-2 flex items-center gap-3 font-mono text-[12px] text-white/80">
            margin m · illustrative {margin.toFixed(2)}
            <input
              type="range"
              min={0}
              max={0.4}
              step={0.01}
              value={margin}
              aria-label="Illustrative asymmetric-loss margin"
              onChange={(event) => setMargin(Number(event.target.value))}
              className="w-full accent-[#7C5CFF]"
            />
          </label>
          <p className="mt-1 font-mono text-[10px] text-white/40">x: predicted P(HER2+) on a negative label · y: loss, clipped at 4</p>
        </div>
      </div>
    </article>
  );
}

function drawChart(
  canvas: HTMLCanvasElement | null,
  xs: number[],
  series: { color: string; values: number[] }[],
) {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 192;
  const nextW = Math.round(cssW * dpr);
  const nextH = Math.round(cssH * dpr);
  if (canvas.width !== nextW || canvas.height !== nextH) {
    canvas.width = nextW;
    canvas.height = nextH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const yMax = 4;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const pad = { l: 32, r: 8, t: 10, b: 22 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;
  ctx.font = "11px JetBrains Mono, monospace";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.t + (h * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
    ctx.fillText(String(yMax - i), 2, y + 3);
  }
  ctx.fillText("0", pad.l, cssH - 6);
  ctx.fillText("1", pad.l + w - 6, cssH - 6);

  for (const line of series) {
    ctx.beginPath();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 2;
    line.values.forEach((value, index) => {
      const x = pad.l + (w * index) / (xs.length - 1);
      const y = pad.t + h * (1 - Math.min(yMax, value) / yMax);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
