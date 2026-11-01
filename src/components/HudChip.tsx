import type { ReactNode } from "react";

const TONE = {
  neutral: "text-white/90",
  ok: "text-ok",
  gt: "text-gt",
  model: "text-model",
} as const;

export function HudChip({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: keyof typeof TONE;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 font-mono text-[11px] tracking-wide backdrop-blur-md ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
