import { THRESHOLD } from "../config/model";
import { useCountUp } from "../hooks/useCountUp";
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
  const shown = useCountUp(probability, !hidden);
  const modelPositive = probability >= THRESHOLD;
  const ihcPositive = ihc === 1;
  const match = modelPositive === ihcPositive;

  return (
    <article className="panel min-w-0 px-2.5 py-2 sm:px-3" aria-label={`${receptor} probability`}>
      <h3 className="font-mono text-[11px] tracking-[0.16em] text-white/55">{receptor}</h3>
      <p className="mt-1 font-mono text-[clamp(1.45rem,2.2vw,2.15rem)] leading-none font-semibold text-model tabular-nums">
        {hidden ? "—.——" : shown.toFixed(3)}
      </p>
      <p className="mt-1.5 font-mono text-[11px] text-white/80">{hidden ? "—" : modelPositive ? "Positive" : "Negative"}</p>
      {showIhc ? (
        <p className="mt-2 flex items-center justify-between gap-1 font-mono text-[10px] text-gt">
          <span>{ihcPositive ? "IHC +" : "IHC −"}</span>
          {hidden ? null : (
            <span
              className={`rounded-full px-1.5 py-0.5 ${match ? "bg-ok/15 text-ok" : "bg-model/15 text-model"}`}
            >
              {match ? "✓" : "✗"}
              <span className="sr-only">{match ? "matches the model call" : "differs from the model call"}</span>
            </span>
          )}
        </p>
      ) : null}
    </article>
  );
}
