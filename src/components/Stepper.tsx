import { SCENES } from "../lib/timeline";

export function Stepper({ activeIndex }: { activeIndex: number }) {
  const scene = activeIndex >= 0 && activeIndex < SCENES.length ? SCENES[activeIndex] : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[12px] tracking-wide text-white/80">{scene ? `${activeIndex + 1} / ${SCENES.length}` : "Ready"}</p>
        <p className="font-mono text-[10px] tracking-[0.16em] text-white/45 uppercase">{scene?.label ?? "Idle"}</p>
      </div>
      <ol className="mt-2 flex items-center gap-1.5" aria-label="Scene progress">
        {SCENES.map((item, index) => {
          const state = activeIndex < 0 ? "idle" : index < activeIndex ? "done" : index === activeIndex ? "active" : "todo";
          const dot = state === "active" ? "bg-white" : state === "done" ? "bg-white/55" : "bg-white/18";
          return (
            <li key={item.id}>
              <span className={`block h-1.5 w-1.5 rounded-full ${dot}`} />
              <span className="sr-only">{item.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
