import { AUTHORS, PAPER } from "../data/paper";

export function PaperSection() {
  return (
    <section id="paper" className="mx-auto w-full max-w-[1680px] px-3 py-12 pb-20 sm:px-5">
      <article className="panel p-5 sm:p-8">
        <p className="font-mono text-[12px] tracking-[0.18em] text-fuse uppercase">Paper</p>
        <h2 className="mt-2 max-w-4xl text-2xl font-semibold tracking-tight sm:text-4xl">{PAPER.title}</h2>
        <p className="mt-3 font-mono text-[13px] text-white/60">
          {PAPER.venue} · {PAPER.conference}
          <br />
          {PAPER.place} · {PAPER.dates}
          <br />
          {PAPER.series} ({PAPER.seriesShort}) {PAPER.volume} · pp. {PAPER.pages} · {PAPER.publisher}
        </p>
        <ol className="mt-6 space-y-2">
          {AUTHORS.map((author) => (
            <li key={author.name} className="text-[15px]">
              <span className="text-white">
                {author.name}
                {"equal" in author && author.equal ? "*" : ""}
                {"corresponding" in author && author.corresponding ? "†" : ""}
              </span>
              <span className="text-white/55"> — {author.affiliation}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 font-mono text-[11px] text-white/45">* Equal contribution. † Corresponding author.</p>
        <a
          href={PAPER.doiUrl}
          className="mt-5 inline-flex rounded-full border border-fuse/60 px-4 py-2 font-mono text-[13px] text-fuse hover:bg-fuse/10"
        >
          doi:{PAPER.doi}
        </a>
        <p className="mt-6 rounded-[14px] border border-gt/50 bg-gt/10 px-4 py-3 text-[15px] leading-relaxed text-gt">
          {PAPER.disclaimer}
        </p>
      </article>
    </section>
  );
}
