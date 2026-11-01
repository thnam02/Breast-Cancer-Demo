import type { ReactNode } from "react";

const TONE = {
  gt: "#F5B84B",
  model: "#FF5A5F",
  gene: "#3EE0B0",
  wsi: "#FF5FA2",
  fuse: "#7C5CFF",
} as const;

export function StoryCard({
  title,
  tone,
  footer,
  children,
}: {
  title: string;
  tone: keyof typeof TONE;
  footer?: string;
  children: ReactNode;
}) {
  const color = TONE[tone];
  return (
    <article
      className="max-w-[280px] rounded-[14px] border bg-black/60 p-3 shadow-lg backdrop-blur-md"
      style={{ borderColor: color }}
    >
      <h3 className="font-mono text-[12px] font-bold tracking-wide" style={{ color }}>
        {title}
      </h3>
      <div className="mt-1.5 text-[13px] leading-snug text-white/90">{children}</div>
      {footer ? <p className="mt-2 text-[11px] leading-snug text-white/55">{footer}</p> : null}
    </article>
  );
}
