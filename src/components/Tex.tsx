import { useEffect, useRef } from "react";

export function Tex({ tex, display = true }: { tex: string; display?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const render = () => {
      void (async () => {
        const katex = await import("katex");
        await import("katex/dist/katex.min.css");
        if (cancelled || !ref.current) return;
        katex.render(tex, ref.current, { throwOnError: false, displayMode: display });
      })();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        render();
      },
      { rootMargin: "160px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [display, tex]);

  return <div ref={ref} className="min-h-10 overflow-x-auto py-1" />;
}
