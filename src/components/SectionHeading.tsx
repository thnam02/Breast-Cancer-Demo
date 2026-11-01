import type { ReactNode } from "react";

export function SectionHeading({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 max-w-3xl">
      <p className="font-mono text-[12px] tracking-[0.18em] text-fuse uppercase">{kicker}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {children ? <p className="mt-2 text-[15px] leading-relaxed text-white/70">{children}</p> : null}
    </header>
  );
}
