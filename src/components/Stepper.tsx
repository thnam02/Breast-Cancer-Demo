import { PIPELINE_STEPS } from "../lib/timeline";

export function Stepper({
  activeIndex,
  caption,
  formula,
  progress,
}: {
  /** -1 at rest. 0–4 while that step is current. */
  activeIndex: number;
  caption?: string;
  formula?: string;
  progress?: number;
}) {
  return (
    <div>
      <ol className="relative grid grid-cols-5 gap-1">
        <span className="pointer-events-none absolute top-[7px] right-[10%] left-[10%] h-px bg-white/15" />
        {PIPELINE_STEPS.map((step, index) => {
          const state = activeIndex < 0 ? "idle" : index < activeIndex ? "done" : index === activeIndex ? "active" : "todo";
          const dot =
            state === "done"
              ? "border-ok bg-ok"
              : state === "active"
                ? "border-fuse bg-fuse shadow-[0_0_12px_#7C5CFF]"
                : "border-white/25 bg-bg";
          const label = state === "active" ? "text-white" : state === "done" ? "text-ok" : "text-white/45";
          return (
            <li key={step.id} className="relative flex flex-col items-center gap-1 text-center">
              <span className={`h-3.5 w-3.5 rounded-full border ${dot}`} />
              <span className={`font-mono text-[10px] tracking-wide ${label}`}>{step.label}</span>
            </li>
          );
        })}
      </ol>
      {typeof progress === "number" ? (
        <div className="mt-2 h-px overflow-hidden bg-white/10">
          <div className="h-px bg-fuse" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
        </div>
      ) : null}
      {caption ? (
        <p className="mt-2 text-[13px] leading-snug text-white/80" aria-live="polite">
          {caption}
        </p>
      ) : null}
      {formula ? <p className="mt-1 font-mono text-[11px] leading-relaxed break-words text-wsi">{formula}</p> : null}
    </div>
  );
}
