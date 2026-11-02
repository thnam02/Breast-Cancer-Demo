import { useEffect, useRef, useState } from "react";
import { THRESHOLD } from "../config/model";
import { predictionProgress } from "../lib/prediction";
import type { Receptor } from "../types/case";

export function MetricCard({
  receptor,
  probability,
  hidden,
  showIhc,
  ihc,
}: {
  receptor: Receptor;
  probability: number;
  hidden: boolean;
  showIhc: boolean;
  ihc: 0 | 1;
}) {
  const numberRef = useRef<HTMLParagraphElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const [settled, setSettled] = useState(false);
  const finalPositive = probability >= THRESHOLD;
  const ihcPositive = ihc === 1;
  const match = finalPositive === ihcPositive;

  useEffect(() => {
    if (hidden) {
      setSettled(false);
      return;
    }
    let frame = 0;
    let marked = false;
    const tick = () => {
      const progress = predictionProgress();
      const exact = progress >= 1;
      const shown = exact ? probability : probability * progress;
      if (numberRef.current) numberRef.current.textContent = exact ? probability.toFixed(3) : shown.toFixed(3);
      if (barRef.current) barRef.current.style.width = `${shown * 100}%`;
      if (progress >= 1 && !marked) {
        marked = true;
        setSettled(true);
      } else if (progress < 1 && marked) {
        marked = false;
        setSettled(false);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [hidden, probability]);

  return (
    <article className="panel min-w-0 px-2.5 py-2 sm:px-3" aria-label={`${receptor} probability`}>
      <h3 className="font-mono text-[11px] tracking-[0.16em] text-white/55">{receptor}</h3>
      {hidden ? (
        <>
          <span className="mt-3 block h-px w-full bg-white/20" />
          <p className="mt-2 font-mono text-[11px] tracking-wide text-white/45">awaiting inference</p>
        </>
      ) : (
        <>
          <p
            ref={numberRef}
            className="mt-1 font-mono text-[clamp(1.45rem,2.2vw,2.15rem)] leading-none font-semibold text-model tabular-nums"
          />
          <span className="mt-2 block h-px w-full bg-white/12">
            <span ref={barRef} className="block h-px w-0 bg-model" />
          </span>
          <p className="mt-1.5 min-h-[1rem] font-mono text-[11px] text-white/80">
            {settled ? (finalPositive ? "Positive" : "Negative") : ""}
          </p>
        </>
      )}
      {showIhc ? (
        <p className="mt-2 flex items-center justify-between gap-1 font-mono text-[10px] text-gt">
          <span>{ihcPositive ? "IHC +" : "IHC −"}</span>
          {!hidden && settled ? (
            <span className={`rounded-full px-1.5 py-0.5 ${match ? "bg-ok/15 text-ok" : "bg-model/15 text-model"}`}>
              {match ? "✓" : "✗"}
              <span className="sr-only">{match ? "matches the model call" : "differs from the model call"}</span>
            </span>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
