import { useEffect, useState } from "react";

const LINKS = [
  { href: "#demo", id: "demo", label: "Demo" },
  { href: "#modality", id: "modality", label: "Modality Lab" },
  { href: "#results", id: "results", label: "Results" },
  { href: "#method", id: "method", label: "How it works" },
  { href: "#paper", id: "paper", label: "Paper" },
] as const;

export function TopBar() {
  const [active, setActive] = useState("demo");

  useEffect(() => {
    const sections = LINKS.map((link) => document.getElementById(link.id)).filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5">
        <h1 className="font-mono text-[18px] font-semibold tracking-tight">
          <a href="#demo">
            <span className="text-white">Receptor</span>
            <span className="text-model">Lens</span>
          </a>
        </h1>
        <nav className="order-3 flex w-full min-w-0 gap-1 overflow-x-auto min-[900px]:order-none min-[900px]:w-auto" aria-label="Page">
          {LINKS.map((link) => (
            <a
              key={link.id}
              href={link.href}
              aria-current={active === link.id ? "true" : undefined}
              className={`rounded-full px-3 py-1 font-mono text-[12px] whitespace-nowrap ${
                active === link.id ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
              }`}
            >
              {link.label}
            </a>
          ))}
          <a
            href="./slides/"
            className="rounded-full border border-white/15 px-3 py-1 font-mono text-[12px] whitespace-nowrap text-white/75 hover:border-white/35 hover:text-white"
          >
            Slides
          </a>
        </nav>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-ok/40 bg-ok/10 px-3 py-1 font-mono text-[11px] whitespace-nowrap text-ok">
          ● UNI2-h · 1536-d
        </span>
      </div>
    </header>
  );
}
