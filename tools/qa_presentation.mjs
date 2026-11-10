// QA for presentation/index.html: screenshots every step and checks text/graphic overlaps.
//   node tools/qa_presentation.mjs
// Uses the system Google Chrome through playwright-core. Writes presentation/qa/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(path.join(ROOT, 'presentation', 'index.html')).href;
const OUT = path.join(ROOT, 'presentation', 'qa');
const VIEWPORTS = [[1920, 1080], [1280, 720]];
const SETTLE_MS = 3600; // longest step animation (tile flight + late reveals) is ~3.6 s
const S2_ENCODE_MS = 5600; // slide 2 step 2 encodes five rows one after another (~4.9 s)
const S2_MID_SHOTS = [1500, 3000]; // review frames inside that step; overlap is checked on resting frames only
const S3_SETTLE_MS = { 1: 5800, 2: 4800 }; // slide 3: schematic panels + reads (~5.3 s); strip grow + landmarks (~4.1 s)
const S4_TILES_MS = 6400;  // slide 4 step 5: six tiles 800 ms apart + magnifier (~5.5 s)
const S4_MID_SHOTS = [500, 3000];
const settleFor = (s, k) => (s === 2 && S3_SETTLE_MS[k]) || SETTLE_MS;

// Slide 4 step 5 markers, all in 1600x900 stage px.
const TOP_TILES = JSON.parse(fs.readFileSync(path.join(ROOT, 'presentation', 'assets', 'top_tiles.json'), 'utf8'));
function s4State() {
  const stage = document.getElementById('stage'), sr = stage.getBoundingClientRect(), sc = sr.width / 1600;
  const box = r => ({ x: (r.left - sr.left) / sc, y: (r.top - sr.top) / sc, w: r.width / sc, h: r.height / sc });
  const shown = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  const toStage = (el, x, y) => { const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM()); return { x: (p.x - sr.left) / sc, y: (p.y - sr.top) / sc }; };
  const rings = [...document.querySelectorAll('#tmsvg .tring')].filter(shown).map(g => {
    const c = g.querySelector('circle.tr'), p = toStage(c, +c.getAttribute('cx'), +c.getAttribute('cy'));
    return { ...p, r: +c.getAttribute('r') * c.getScreenCTM().a / sc, source: g.dataset.source, score: g.dataset.score === '' ? null : +g.dataset.score,
      rank: g.dataset.rank === '' ? null : +g.dataset.rank, running: g.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length };
  });
  const badges = [...document.querySelectorAll('#tmarks .tbadge')].filter(shown).map(b => ({ ...box(b.getBoundingClientRect()), text: b.textContent }));
  const captions = ['#capB', '#tsrc'].map(s => document.querySelector(s)).filter(shown).map(e => {
    const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect(); return box(r);
  });
  const imgs = [...document.querySelectorAll('#gal img')].map(i => box(i.getBoundingClientRect()));
  let leaderHits = 0, leaders = 0;
  for (const p of document.querySelectorAll('#tmsvg path.tlead')) {
    if (!shown(p)) continue;
    leaders++;
    for (let s = 0, L = p.getTotalLength(); s <= L; s += 1) {
      const q = p.getPointAtLength(s), v = toStage(p, q.x, q.y);
      if (imgs.some(b => v.x >= b.x && v.x <= b.x + b.w && v.y >= b.y && v.y <= b.y + b.h)) { leaderHits++; break; }
    }
  }
  const wsi = box(document.getElementById('wsi').getBoundingClientRect());
  return { rings, badges, captions, leaders, leaderHits, wsi, lens: [...document.querySelectorAll('.tlens')].filter(shown).length,
    note: document.getElementById('tsrc').textContent };
}
// Landmark callouts must show exactly what tools/gene_strip.py wrote.
const GENE_STRIP = JSON.parse(fs.readFileSync(path.join(ROOT, 'presentation', 'assets', 'gene_strip.json'), 'utf8'));
const fmtN = n => n.toLocaleString('en-US');
const rankText = (rank, total) => {
  const p = 100 * rank / total;
  return p < 0.1 ? `#${fmtN(rank)} of ${fmtN(total)}` : `top ${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
};
const S3_EXPECTED = Object.fromEntries((GENE_STRIP.landmarks || []).map(l =>
  [l.gene, `log2 = ${l.log2.toFixed(2)} · ${rankText(l.rank, GENE_STRIP.genes_total)}`]));
const GREEN = 'rgb(31, 157, 116)';

function s3State() {
  const vis = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  const lm = [...document.querySelectorAll('#strip .lmb')];
  return {
    counter: document.getElementById('counter').textContent,
    panels: [...document.querySelectorAll('#bioCard .bp.on')].length,
    foot: +getComputedStyle(document.getElementById('biofoot')).opacity,
    greyColours: [...new Set([...document.querySelectorAll('#strip .gb')].map(b => getComputedStyle(b).backgroundColor))],
    greenShown: lm.filter(vis).length,
    greenColours: [...new Set(lm.map(b => getComputedStyle(b).backgroundColor))],
    callouts: Object.fromEntries([...document.querySelectorAll('#s3co .co')].filter(vis).map(c => [c.dataset.gene, c.querySelector('.cov').textContent])),
    leaders: [...document.querySelectorAll('#s3lead path.on')].length,
    links: document.getElementById('lkCard').classList.contains('on') ? document.querySelectorAll('#lkRow .lk').length : 0,
    colourScale: [...document.querySelectorAll('#s3 *')].some(e => /gradient/.test(getComputedStyle(e).backgroundImage)),
  };
}

const S2_GRID = '50 1 0 0 1 0 0 1 0 1 0 0';
const S2_FILL = 'nA--A--A-A--'; // n = numeric fill, A = one-hot 1, - = 0

// Slide 2 encoding state: grid values and fills, source-row highlight, note, strip, connector.
function s2State() {
  const cells = [...document.querySelectorAll('#s2 .enc .cb')];
  const strip = [...document.querySelectorAll('#xs .xc')];
  return {
    counter: document.getElementById('counter').textContent,
    grid: cells.map(c => c.textContent.trim() || '_').join(' '),
    fill: cells.map(c => (c.classList.contains('one') ? 'A' : c.classList.contains('num') ? 'n' : '-')).join(''),
    hi: document.querySelectorAll('#recCard .rr.hi').length,
    note: +getComputedStyle(document.getElementById('s2note')).opacity,
    gridOpacity: +getComputedStyle(document.querySelector('#s2 .enc')).opacity,
    stripOn: document.getElementById('xs').classList.contains('on'),
    strip: strip.map(c => c.textContent).join(' '),
    stripAtDest: strip.every(c => c.style.left === c._dest.x + 'px' && c.style.top === c._dest.y + 'px'),
    captions: [...document.querySelectorAll('#xs .xg')].map(g => g.textContent).join(' · '),
    conn: parseFloat(getComputedStyle(document.querySelector('#x2conn path')).strokeDashoffset),
    connOn: document.getElementById('x2conn').classList.contains('on'),
    mlpWait: document.querySelector('#s2 .mlp').classList.contains('wait'),
  };
}

// Runs inside the page. Coordinates are reported in 1600x900 stage pixels.
function analyze() {
  const stage = document.getElementById('stage');
  const sr = stage.getBoundingClientRect();
  const sc = sr.width / 1600;
  const box = r => ({ x: (r.left - sr.left) / sc, y: (r.top - sr.top) / sc, w: r.width / sc, h: r.height / sc });
  const shown = el => {
    let op = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      op *= parseFloat(cs.opacity);
    }
    return op > 0.05;
  };
  const describe = el => {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  };
  const roots = [document.querySelector('.slide.active'), document.getElementById('footer')];

  const texts = [];
  for (const root of roots) {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent.trim() || !shown(n.parentElement)) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 0.5 || r.height < 0.5) continue;
        texts.push({ node: n, el: n.parentElement, b: box(r), label: n.textContent.trim().slice(0, 48) });
      }
    }
  }
  // Graphics. Lines/paths are tested along their drawn stroke (sampled every 2 px; connectors padded by the
  // travelling dot's radius); unfilled circles (ring gauges) by their stroke band; everything else by its box.
  const graphics = [];
  const sel = 'img, canvas, .g, svg line, svg path, svg circle, svg rect, svg polygon, svg polyline, svg ellipse';
  const toStage = (x, y) => ({ x: (x - sr.left) / sc, y: (y - sr.top) / sc });
  for (const root of roots) for (const el of root.querySelectorAll(sel)) {
    if (el.closest('defs, marker') || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) continue;
    const g = { el, b: box(r), label: describe(el) };
    const tag = el.tagName.toLowerCase(), cs = getComputedStyle(el);
    const m = el.getScreenCTM && el.getScreenCTM();
    const unit = m ? Math.hypot(m.a, m.b) / sc : 1;
    const sw = (parseFloat(cs.strokeWidth) || 0) * unit;
    if ((tag === 'path' || tag === 'line' || tag === 'polyline') && m && cs.stroke !== 'none' && (cs.fill === 'none' || tag === 'line')) {
      const half = Math.max(sw / 2, el.classList.contains('conn') ? 4 : 0.5);
      const len = el.getTotalLength(), pts = [];
      for (let s = 0; s <= len; s += 2) {
        const p = el.getPointAtLength(s), q = new DOMPoint(p.x, p.y).matrixTransform(m);
        pts.push(toStage(q.x, q.y));
      }
      g.samples = pts.map(p => ({ x: p.x - half, y: p.y - half, w: 2 * half, h: 2 * half }));
      g.b = { x: g.b.x - half, y: g.b.y - half, w: g.b.w + 2 * half, h: g.b.h + 2 * half };
    } else if (tag === 'circle' && cs.fill === 'none') {
      const R = g.b.w / 2;
      g.ring = { cx: g.b.x + R, cy: g.b.y + R, r0: R - sw / 2, r1: R + sw / 2 };
      g.b = { x: g.b.x - sw / 2, y: g.b.y - sw / 2, w: g.b.w + sw, h: g.b.h + sw };
    }
    graphics.push(g);
  }
  const hitsRing = (t, k) => {
    const dx = Math.max(t.x - k.cx, 0, k.cx - (t.x + t.w)), dy = Math.max(t.y - k.cy, 0, k.cy - (t.y + t.h));
    const fx = Math.max(Math.abs(t.x - k.cx), Math.abs(t.x + t.w - k.cx)), fy = Math.max(Math.abs(t.y - k.cy), Math.abs(t.y + t.h - k.cy));
    return Math.hypot(fx, fy) >= k.r0 && Math.hypot(dx, dy) <= k.r1;
  };

  const inter = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    const W = Math.round(w * 100) / 100, H = Math.round(h * 100) / 100;
    return W > 0 && H > 0 ? { w: W, h: H } : null;
  };
  const r2 = b => ({ x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.w.toFixed(1), h: +b.h.toFixed(1) });
  const issues = [];
  for (const t of texts) for (const g of graphics) {
    if (g.el.contains(t.node)) continue; // a box that holds its own label is a container, not an overlap
    if (t.el.closest('.onimg') && g.el.closest('#wsi')) continue; // marker badges are placed on the slide image by design
    let i = inter(t.b, g.b);
    if (i && g.samples) i = g.samples.map(s => inter(t.b, s)).find(Boolean) || null;
    else if (i && g.ring) i = hitsRing(t.b, g.ring) ? i : null;
    if (i) issues.push({ kind: 'text×graphic', text: t.label, other: g.label, overlap: i, a: r2(t.b), b: r2(g.b) });
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    if (texts[i].node === texts[j].node) continue;
    const o = inter(texts[i].b, texts[j].b);
    if (o) issues.push({ kind: 'text×text', text: texts[i].label, other: texts[j].label, overlap: o, a: r2(texts[i].b), b: r2(texts[j].b) });
  }
  // Clipping / overflow: text must stay inside its clipping ancestors, its card, the stage, and out of the footer band.
  for (const t of texts) {
    const inFooter = t.el.closest('#footer');
    const b = t.b, eps = 0.5;
    const outside = (c, why) => {
      if (b.x < c.x - eps || b.y < c.y - eps || b.x + b.w > c.x + c.w + eps || b.y + b.h > c.y + c.h + eps)
        issues.push({ kind: 'overflow', text: t.label, other: why, a: r2(b), b: r2(c) });
    };
    outside({ x: 0, y: 0, w: 1600, h: 900 }, 'stage');
    if (!inFooter) outside({ x: 0, y: 0, w: 1600, h: 860 }, 'above footer band');
    const card = t.el.closest('.card');
    if (card) outside(box(card.getBoundingClientRect()), 'card ' + describe(card));
    for (let e = t.el; e && e !== stage; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflow !== 'visible') { outside(box(e.getBoundingClientRect()), 'clip ' + describe(e)); break; }
    }
  }

  // Content checks
  const active = document.querySelector('.slide.active');
  const visText = texts.map(t => t.node.textContent).join(' ');
  const topTiles = [...document.querySelectorAll('img[data-top]')].filter(shown).length;
  const s3 = document.getElementById('s3');
  const s3media = [...s3.querySelectorAll('img, canvas')].length;
  const s3colors = new Set([...s3.querySelectorAll('#strip .gb')].map(b => getComputedStyle(b).backgroundColor));
  const minFont = Math.min(...texts.filter(t => !t.el.closest('#footer')).map(t => parseFloat(getComputedStyle(t.el).fontSize)));
  return {
    slide: active.id, texts: texts.length, graphics: graphics.length, issues, minFont,
    visText, topTiles, s3media, s3colors: [...s3colors],
    encoderOnSlide: /encoder/i.test(visText),
  };
}

// Slide 5 structure: connector/arc crossings, shared-layer rows, head lengths, "Encoder" anywhere in the slide.
function fusionChecks() {
  const s5 = document.getElementById('s5');
  const polys = [...s5.querySelectorAll('path.conn, path.arc5')].map(p => {
    const m = p.getScreenCTM(), len = p.getTotalLength(), pts = [];
    for (let s = 0; s <= len; s += 1.5) { const q = p.getPointAtLength(s); const r = new DOMPoint(q.x, q.y).matrixTransform(m); pts.push([r.x, r.y]); }
    const e = p.getPointAtLength(len), en = new DOMPoint(e.x, e.y).matrixTransform(m);
    pts.push([en.x, en.y]);
    return { id: p.getAttribute('d'), pts, ends: [pts[0], pts[pts.length - 1]] };
  });
  const cross = (a, b, c, d) => {
    const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
    const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] : null;
  };
  const near = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r;
  const crossings = [];
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
    const A = polys[i], B = polys[j];
    for (let a = 1; a < A.pts.length; a++) for (let b = 1; b < B.pts.length; b++) {
      const x = cross(A.pts[a - 1], A.pts[a], B.pts[b - 1], B.pts[b]);
      if (x && ![...A.ends, ...B.ends].some(e => near(x, e, 10))) { crossings.push([A.id, B.id]); a = A.pts.length; break; }
    }
  }
  const layers = [...s5.querySelectorAll('#mlp5 .mrow5')].map(g => ({ n: g.dataset.n, nodes: g.querySelectorAll('circle').length }));
  const rows = Object.fromEntries([...s5.querySelectorAll('.row5')].map(r => [r.dataset.r, r.querySelectorAll('.blk').length]));
  return {
    paths: polys.length, crossings,
    layers, layerLabels: [...s5.querySelectorAll('#mlp5lab .mlab5')].map(l => l.textContent.trim()),
    rows, encoder: /encoder/i.test(s5.textContent),
  };
}

const allText = () => [...document.querySelectorAll('.slide')].map(s => s.textContent.replace(/\s+/g, ' ')).join('\n');
const slide4Text = () => document.getElementById('s4').textContent.replace(/\s+/g, ' ');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const report = { url: URL, viewports: {}, checks: [] };
const check = (name, ok, detail = '') => report.checks.push({ name, ok, detail });
let shots = 0;

for (const [w, h] of VIEWPORTS) {
  const tag = `${w}x${h}`;
  fs.mkdirSync(path.join(OUT, tag), { recursive: true });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached' });
  await page.waitForTimeout(1200);
  // Positive control: plant a label over a graphic and over another label; the checker must flag both.
  await page.evaluate(() => {
    const s = document.querySelector('.slide.active');
    s.insertAdjacentHTML('beforeend', '<div id="qa-g" class="g" style="position:absolute;left:300px;top:640px;width:80px;height:40px;background:red"></div>' +
      '<div id="qa-t1" style="position:absolute;left:320px;top:650px;font-size:14px">planted A</div>' +
      '<div id="qa-t2" style="position:absolute;left:330px;top:655px;font-size:14px">planted B</div>');
  });
  const ctl = await page.evaluate(analyze);
  const kinds = new Set(ctl.issues.filter(i => /planted/.test(i.text)).map(i => i.kind));
  check(`${tag}: checker self-test flags planted overlaps`, kinds.has('text×graphic') && kinds.has('text×text'), [...kinds].join(', '));
  await page.evaluate(() => ['qa-g', 'qa-t1', 'qa-t2'].forEach(id => document.getElementById(id).remove()));

  const steps = await page.evaluate(() => [...document.querySelectorAll('.slide')].map(s => +s.dataset.steps));
  const rows = [];
  for (let s = 0; s < steps.length; s++) for (let k = 1; k <= steps[s]; k++) {
    if (s === 3 && k === 5) {
      await page.keyboard.press('ArrowRight');
      const t0 = Date.now();
      for (const at of S4_MID_SHOTS) {
        await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
        await page.screenshot({ path: path.join(OUT, tag, `slide4-step5-mid-${at / 1000}s.png`) });
        shots++;
      }
      await page.waitForTimeout(Math.max(0, S4_TILES_MS - (Date.now() - t0)));
    } else if (s === 1 && k === 2) {
      await page.keyboard.press('ArrowRight');
      const t0 = Date.now();
      for (const at of S2_MID_SHOTS) {
        await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
        await page.screenshot({ path: path.join(OUT, tag, `slide2-step2-mid-${at / 1000}s.png`) });
        shots++;
        if (tag === '1920x1080' && at === S2_MID_SHOTS[0]) {
          const m = await page.evaluate(s2State);
          check('Slide 2 step 2 at 1.5 s: one source row highlighted, grid still filling', m.hi === 1 && m.grid !== S2_GRID, `hi=${m.hi} grid=${m.grid}`);
        }
      }
      await page.waitForTimeout(Math.max(0, S2_ENCODE_MS - (Date.now() - t0)));
    } else if (s || k > 1) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(settleFor(s, k)); }
    const file = path.join(OUT, tag, `slide${s + 1}-step${k}.png`);
    await page.screenshot({ path: file });
    shots++;
    const a = await page.evaluate(analyze);
    const counter = await page.textContent('#counter');
    rows.push({ slide: s + 1, step: k, counter, texts: a.texts, graphics: a.graphics, issues: a.issues });
    if (tag === '1920x1080' && s === 3 && k === 5) {
      const m = await page.evaluate(s4State);
      const ok = r => r.source === 'pipeline' || (r.source === 'template_match' && r.score >= 0.8);
      const numbered = m.rings.filter(r => r.rank != null);
      check('Slide 4 step 5: every numbered marker has real coordinates (pipeline, or template_match ≥ 0.8); otherwise un-numbered',
        numbered.every(ok) && m.badges.length === numbered.length && m.rings.filter(r => r.rank == null).every(r => r.source === 'approximate'),
        m.rings.map(r => `${r.rank ?? '–'}:${r.source}${r.score != null ? '@' + r.score : ''}`).join(' '));
      const want = TOP_TILES.filter(d => d.source === 'pipeline' || (d.source === 'template_match' && d.score >= 0.8));
      const kx = m.wsi.w / 705, ky = m.wsi.h / 519;
      const off = want.map(d => { const r = m.rings.find(q => q.rank === d.rank); return r ? Math.hypot(r.x - (m.wsi.x + (d.x + d.w / 2) * kx), r.y - (m.wsi.y + (d.y + d.h / 2) * ky)) : Infinity; });
      check(`Slide 4 step 5: ${want.length} markers sit on their top_tiles.json locations (±0.5 px)`, off.every(o => o <= 0.5), off.map(o => o.toFixed(2)).join(' '));
      const halo = 2, pairs = [];
      m.rings.forEach((a, i) => m.rings.slice(i + 1).forEach(b => { if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 2 * halo) pairs.push(`${a.rank}×${b.rank}`); }));
      check('Slide 4 step 5: rings (with white halo) do not overlap each other', pairs.length === 0, pairs.join(' ') || `radii ${m.rings.map(r => r.r.toFixed(1)).join('/')}`);
      const hitRing = (b, r) => Math.hypot(Math.max(b.x - r.x, 0, r.x - (b.x + b.w)), Math.max(b.y - r.y, 0, r.y - (b.y + b.h))) < r.r + halo;
      const hitBox = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const clash = [];
      m.badges.forEach((b, i) => {
        m.rings.forEach(r => hitRing(b, r) && clash.push(`${b.text}×ring${r.rank}`));
        m.badges.slice(i + 1).forEach(o => hitBox(b, o) && clash.push(`${b.text}×${o.text}`));
        m.captions.forEach(c => hitBox(b, c) && clash.push(`${b.text}×caption`));
      });
      m.rings.forEach(r => m.captions.forEach(c => hitRing(c, r) && clash.push(`ring${r.rank}×caption`)));
      check('Slide 4 step 5: badges clear of rings, other badges and the caption; rings clear of the caption', clash.length === 0, clash.join(' '));
      check('Slide 4 step 5: no leader line crosses a tile image', m.leaderHits === 0 && m.leaders === numbered.length, `${m.leaders} leaders, ${m.leaderHits} crossing`);
      check('Slide 4 step 5: final frame is static (no ring pulse running, magnifier gone)', m.rings.every(r => r.running === 0) && m.lens === 0,
        `running=${m.rings.map(r => r.running).join('')} lens=${m.lens}`);
      check('Slide 4 step 5: source note shown', /^Tile locations: (model tile coordinates|matched to the original slide|approximate)/.test(m.note), m.note);
    }
    if (tag === '1920x1080' && s === 1) {
      const m = await page.evaluate(s2State);
      check(`Slide 2 step ${k}: counter shows 5 steps`, m.counter === `Slide 2/5 · Step ${k}/5`, m.counter);
      if (k >= 2) check(`Slide 2 step ${k}: grid encoded, no source highlight, note shown`,
        m.grid === S2_GRID && m.fill === S2_FILL && m.hi === 0 && m.note === 1, `grid=${m.grid} fill=${m.fill} hi=${m.hi} note=${m.note}`);
      if (k === 2) check('Slide 2 step 2: strip not shown yet', !m.stripOn);
      if (k >= 3) check(`Slide 2 step ${k}: x(c) strip = [${S2_GRID}], in place, grid at 50%`,
        m.stripOn && m.strip === S2_GRID && m.stripAtDest && m.gridOpacity === 0.5 && m.captions === 'Age · Sex · Laterality · Stage · Subtype',
        `strip=${m.strip} atDest=${m.stripAtDest} grid=${m.gridOpacity} captions=${m.captions}`);
      if (k >= 4) check(`Slide 2 step ${k}: connector drawn, network pulses running`, m.connOn && m.conn === 0 && !m.mlpWait,
        `on=${m.connOn} dashoffset=${m.conn} wait=${m.mlpWait}`);
    }
    if (tag === '1920x1080') {
      if (s === 3) check(`Slide 4 step ${k}: top-attention tiles ${k === 5 ? 'shown' : 'hidden'}`, k === 5 ? a.topTiles === 6 : a.topTiles === 0, `${a.topTiles} visible`);
      else check(`Slide ${s + 1} step ${k}: no top-attention tiles`, a.topTiles === 0, `${a.topTiles} visible`);
      if (s === 2) {
        check(`Slide 3 step ${k}: no heatmap / per-gene colours`, a.s3media === 0 && a.s3colors.length === 1, `img/canvas=${a.s3media}, strip colours=${a.s3colors.join(',')}`);
        const m = await page.evaluate(s3State);
        const nLm = Object.keys(S3_EXPECTED).length;
        check(`Slide 3 step ${k}: counter shows 5 steps`, m.counter === `Slide 3/5 · Step ${k}/5`, m.counter);
        check(`Slide 3 step ${k}: no colour scale anywhere on the slide`, !m.colourScale && m.greyColours.length === 1 && m.greenColours.every(c => c === GREEN),
          `grey=${m.greyColours.join(',')} green=${m.greenColours.join(',')} gradient=${m.colourScale}`);
        if (k === 1) check('Slide 3 step 1: all four schematic panels and the result line shown, no landmark bars',
          m.panels === 4 && m.foot === 1 && m.greenShown === 0, `panels=${m.panels} foot=${m.foot} green=${m.greenShown}`);
        if (k === 2) {
          check(`Slide 3 step 2: exactly ${nLm} green landmark bars, one leader each`, nLm <= 4 && m.greenShown === nLm && m.leaders === nLm,
            `green=${m.greenShown} leaders=${m.leaders} expected=${nLm}`);
          const bad = Object.entries(S3_EXPECTED).filter(([g, t]) => m.callouts[g] !== t);
          check('Slide 3 step 2: landmark callouts match tools/gene_strip.py output', bad.length === 0 && Object.keys(m.callouts).length === nLm,
            Object.entries(m.callouts).map(([g, t]) => `${g}: ${t}`).join(' | '));
          check('Slide 3 step 2: clinical link row shows 3 cards', m.links === 3, `${m.links}`);
        }
        if (k >= 3) check(`Slide 3 step ${k}: clinical link row hidden again`, m.links === 0, `${m.links}`);
      }
      if (s === 4) {
        check(`Slide 5 step ${k}: no "Encoder" boxes`, !a.encoderOnSlide);
        check(`Slide 5 step ${k}: all text ≥ 12px`, a.minFont >= 12, `min ${a.minFont}px`);
      }
      if (s === 4 && k === steps[s]) {
        const f = await page.evaluate(fusionChecks);
        check('Slide 5: "Encoder" absent from the whole slide (incl. hidden text)', !f.encoder);
        check(`Slide 5: no connector or arc crosses another (${f.paths} paths)`, f.crossings.length === 0, f.crossings.map(c => c.join(' × ')).join(' | '));
            const want = ['192', '128', '64', '32'];
        check('Slide 5: shared layers drawn as exactly 4 rows labelled 192/128/64/32 with 8/6/4/3 nodes',
          f.layers.map(l => l.n).join() === want.join() && f.layerLabels.join() === want.join() && f.layers.map(l => l.nodes).join() === '8,6,4,3',
          `rows=${f.layers.map(l => l.n + ':' + l.nodes).join(' ')} labels=${f.layerLabels.join('/')}`);
    check('Slide 5: HER2 row has one more block than ER and PR',
          f.rows.HER2 === f.rows.ER + 1 && f.rows.HER2 === f.rows.PR + 1, JSON.stringify(f.rows));
      }
    }
  }
  if (tag === '1920x1080') {
    const txt = await page.evaluate(allText);
    for (const need of ['Clinical data', 'Gene expression data', 'Whole slide image', '64-d vector (clinical data)',
      '64-d vector (gene expression data)', '64-d vector (histopathology data)']) check(`label present: "${need}"`, txt.includes(need));
    for (const bad of [/\bWSI\b/, /Gene expr\.?\b(?!ession)/, /histopathology embedding/i]) check(`stale wording absent: ${bad}`, !bad.test(txt));
    const s4 = await page.evaluate(slide4Text);
    for (const bad of [/0\.21\b/, /0\.15\b/]) check(`Slide 4 tile weights on Fig. 5 scale (no ${bad})`, !bad.test(s4));
    check('Slide 4 tile weights: #1 = 0.00139, #2–#6 marked ≈', s4.includes('0.00139') && (s4.match(/≈0\.0013\d/g) || []).length === 5);
  }
  if (tag === '1920x1080') {
    // Navigation on slide 2: → mid-animation finishes the step at once; ← lands on the resting frame.
    const press = async (key, wait = 300) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };
    const st = () => page.evaluate(s2State);
    await press('Home'); await press('ArrowRight'); await press('ArrowRight', 1200);
    let m = await st();
    check('Nav: 1.2 s into slide 2 step 2 the encoding is still running', m.grid !== S2_GRID && m.hi === 1, `grid=${m.grid} hi=${m.hi}`);
    await press('ArrowRight', 60);
    m = await st();
    check('Nav: → mid-animation completes step 2 instantly and moves to step 3',
      m.counter === 'Slide 2/5 · Step 3/5' && m.grid === S2_GRID && m.fill === S2_FILL && m.hi === 0 && m.note === 1, JSON.stringify(m));
    await page.waitForTimeout(300); await press('ArrowLeft', 60);
    m = await st();
    check('Nav: ← to step 2 shows its resting frame (no replay)',
      m.counter === 'Slide 2/5 · Step 2/5' && m.grid === S2_GRID && m.hi === 0 && m.note === 1 && !m.stripOn && m.gridOpacity === 1, JSON.stringify(m));
    await page.waitForTimeout(300); await press('ArrowRight'); await press('ArrowRight'); await press('ArrowLeft', 60);
    m = await st();
    check('Nav: ← to step 3 shows the assembled strip at once',
      m.counter === 'Slide 2/5 · Step 3/5' && m.stripOn && m.stripAtDest && m.gridOpacity === 0.5, JSON.stringify(m));
    await page.waitForTimeout(300); await press('ArrowRight'); await press('ArrowRight'); await press('ArrowLeft', 60);
    m = await st();
    check('Nav: ← to step 4 shows the drawn connector and running pulses',
      m.counter === 'Slide 2/5 · Step 4/5' && m.conn === 0 && !m.mlpWait, JSON.stringify(m));
  }
  check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  report.viewports[tag] = rows;
  await page.close();
}
await browser.close();

const total = Object.values(report.viewports).flat().reduce((n, r) => n + r.issues.length, 0);
fs.writeFileSync(path.join(OUT, 'overlap-report.json'), JSON.stringify(report, null, 2));

let md = `# Presentation QA report\n\nPage: \`presentation/index.html\` · ${shots} screenshots in \`presentation/qa/<viewport>/\`.\n\n`;
md += `Method: on every step, after animations settle, every visible text line box (DOM Range rects) is intersected with every visible graphic ` +
  `(img, canvas, SVG primitives, cells/bars/connectors marked \`.g\`) and with every other text line box. A box that contains its own label ` +
  `(table cell, head box, Σ node) is treated as a container. Overflow = text leaving its card, a clipping ancestor, the stage, or entering the footer band. ` +
  `Any intersection > 0 px (rounded to 0.01 px) is reported, in 1600×900 stage pixels. ` +
  `\`slide2-step2-mid-*.png\` (1.5 s, 3 s into the encoding) and \`slide4-step5-mid-*.png\` (0.5 s, 3 s into the tile reveal) are review frames; they are not overlap-checked.\n\n`;
md += `**Total issues: ${total}**\n\n`;
for (const [tag, rows] of Object.entries(report.viewports)) {
  md += `## ${tag}\n\n| Slide | Step | Text boxes | Graphics | Overlaps / overflows |\n|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${r.slide} | ${r.step} | ${r.texts} | ${r.graphics} | ${r.issues.length} |\n`;
  for (const r of rows) for (const i of r.issues)
    md += `\n- S${r.slide}/K${r.step} ${i.kind}: "${i.text}" vs ${i.other} ${i.overlap ? `(${i.overlap.w}×${i.overlap.h} px)` : ''} at ${JSON.stringify(i.a)}`;
  md += '\n\n';
}
md += `## Content checks\n\n| Check | Result | Detail |\n|---|---|---|\n`;
for (const c of report.checks) md += `| ${c.name} | ${c.ok ? 'PASS' : '**FAIL**'} | ${c.detail} |\n`;
fs.writeFileSync(path.join(OUT, 'overlap-report.md'), md);

const failed = report.checks.filter(c => !c.ok);
console.log(`screenshots: ${shots}  overlap/overflow issues: ${total}  failed checks: ${failed.length}`);
for (const [tag, rows] of Object.entries(report.viewports)) for (const r of rows) for (const i of r.issues)
  console.log(`${tag} S${r.slide}/K${r.step} ${i.kind}: "${i.text}" vs ${i.other} ${i.overlap ? JSON.stringify(i.overlap) : ''} a=${JSON.stringify(i.a)} b=${JSON.stringify(i.b)}`);
for (const c of failed) console.log('FAIL', c.name, c.detail);
process.exit(total || failed.length ? 1 : 0);
