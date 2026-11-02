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
  solid = false,
}: {
  children: ReactNode;
  tone?: keyof typeof TONE;
  title?: string;
  solid?: boolean;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] tracking-wide ${solid ? "bg-black/85 font-medium antialiased" : "bg-black/60 backdrop-blur-md"} ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
