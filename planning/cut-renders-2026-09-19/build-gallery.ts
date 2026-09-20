/**
 * The browse page over the renders: every library design cut through
 * fixtures/box-50.stl, at both repeat sizes, with what the cut leaves.
 *
 *   node --import ./tests/register.mjs planning/cut-renders-2026-09-19/build-gallery.ts
 *
 * Reads the slices render-cut.ts wrote and emits
 * exports/cut-renders-2026-09-19/index.html next to the images.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { libraryPattern } from '../../src/patterns/library/index.ts'

const OUT = new URL('../../exports/cut-renders-2026-09-19/', import.meta.url)
const ROWS = new URL('rows/', import.meta.url)

interface Cut { parts?: number; thin?: number; volume?: number; broken?: boolean; skipped?: string; error?: string; lost?: number }
interface Row { slug: string; title: string; mode: string; tags: string[]; layers: number
  w50?: Cut; w25?: Cut; w50i?: Cut; w25i?: Cut
  /** the library's own ring measurement, so a card can point at the side worth printing */
  cutAs?: number; cutInv?: number
  /** a generator this project wrote, rather than a library drawing */
  native?: boolean }
/**
 * Every view: repeat size x orientation x cut mode. `i` is the pattern inverted,
 * `f` is each face cut on its own instead of the pattern wrapping the ring.
 */
const KEYS = ['w50', 'w25', 'w50i', 'w25i', 'w50f', 'w25f', 'w50if', 'w25if'] as const
type Key = typeof KEYS[number]

// the as-drawn slices carry the design's name and tags; the inverted ones are
// merged onto them, so a design missing from one sweep still shows the other
const byslug = new Map<string, Row>()
// every file carries the same name and tags and its own view keys, so the merge
// order does not matter; sorted only so a rebuild is reproducible
const files = readdirSync(fileURLToPath(ROWS)).filter(f => f.endsWith('.json')).sort()
for (const f of files) {
  for (const r of JSON.parse(readFileSync(new URL(f, ROWS), 'utf8')) as Row[]) {
    const prev = byslug.get(r.slug)
    byslug.set(r.slug, prev ? { ...prev, ...r } : r)
  }
}
const all = [...byslug.values()].sort((a, b) => a.title.localeCompare(b.title))
for (const r of all) {
  const p = libraryPattern(r.slug)
  if (p) { r.cutAs = p.cutAs; r.cutInv = p.cutInv }
}

// what the printability floor takes away, measured by fine-sweep.ts. A box that
// comes back almost uncut is sparse or is far finer than the nozzle, and only this
// tells the two apart.
const fine: Record<string, Record<string, { lost: number }>> =
  JSON.parse(readFileSync(new URL('fine.json', import.meta.url), 'utf8'))
for (const r of all) for (const key of KEYS) {
  // the two cut modes lay the same tile; only where it goes differs, so what the
  // floor took from that tile is measured once, under the wrapped key
  const l = fine[r.slug]?.[key.replace('f', '')]?.lost
  if (r[key] && l !== undefined) r[key]!.lost = l
}

// only advertise an image that is actually there
for (const r of all) for (const key of KEYS) {
  const c = r[key]
  if (!c || c.skipped || c.error) continue
  if (!existsSync(new URL(`img/${r.slug}-${key}-t.webp`, OUT))) c.error = 'not rendered'
}

const counts = (key: Key) => {
  const cs = all.map(r => r[key]).filter(Boolean) as Cut[]
  return {
    whole: cs.filter(c => c.parts === 1 && c.thin === 1).length,
    thin: cs.filter(c => c.parts === 1 && (c.thin ?? 1) > 1).length,
    broken: cs.filter(c => (c.parts ?? 0) > 1).length,
    none: cs.filter(c => c.skipped || c.error).length,
  }
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cut on the 50 mm box</title>
<style>
  :root {
    --bg: #f4f3f1; --card: #fff; --ink: #1d2126; --dim: #6b7280; --line: #e2e0dc;
    --whole: #1f7a4d; --thinc: #b45309; --broke: #b42318;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { position: sticky; top: 0; z-index: 5; background: rgba(244,243,241,.94);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); padding: 14px 20px; }
  h1 { margin: 0 0 2px; font-size: 18px; font-weight: 650; letter-spacing: -.01em; }
  .sub { color: var(--dim); font-size: 13px; margin-bottom: 10px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  input[type=search] { flex: 1 1 200px; min-width: 160px; padding: 7px 11px; border: 1px solid var(--line);
    border-radius: 8px; background: #fff; font: inherit; color: inherit; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #fff; }
  .seg button { border: 0; background: none; padding: 7px 12px; font: inherit; color: var(--dim); cursor: pointer; }
  .seg button[aria-pressed=true] { background: var(--ink); color: #fff; }
  .count { color: var(--dim); font-size: 13px; margin-left: auto; }
  main { padding: 18px 20px 60px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden;
    cursor: zoom-in; display: flex; flex-direction: column; }
  .card img { width: 100%; aspect-ratio: 880 / 740; object-fit: cover; display: block; background: #eceae6; }
  .meta { padding: 9px 11px 11px; }
  .name { font-weight: 600; font-size: 14px; }
  .tags { color: var(--dim); font-size: 12px; margin-top: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .badge { display: inline-block; margin-top: 7px; font-size: 12px; font-weight: 600;
    padding: 2px 8px; border-radius: 999px; background: #f0efec; color: var(--dim); }
  .badge.whole { background: #e6f4ec; color: var(--whole); }
  .badge.thin { background: #fdf1e0; color: var(--thinc); }
  .badge.broke { background: #fdeceb; color: var(--broke); }
  .empty { color: var(--dim); padding: 40px 0; text-align: center; }
  footer { color: var(--dim); font-size: 13px; padding: 0 20px 40px; max-width: 76ch; }
  footer p { margin: 0 0 7px; }
  footer code { font-size: 12px; background: #eceae6; padding: 1px 5px; border-radius: 5px; }
  dialog { border: 0; border-radius: 14px; padding: 0; max-width: min(1000px, 94vw);
    max-height: 92vh; background: var(--card); }
  /* a dialog is display:none until it opens, so the column layout goes on [open]
     only -- setting it on the element itself would make a closed one visible */
  dialog[open] { display: flex; flex-direction: column; }
  dialog::backdrop { background: rgba(20,22,25,.62); }
  dialog img { flex: 1 1 auto; min-height: 0; width: 100%; object-fit: contain;
    display: block; background: #eceae6; }
  .dtop, .dbot { flex: 0 0 auto; }
  .dtop { display: flex; gap: 10px; align-items: baseline; padding: 13px 16px 0; }
  .dtop h2 { margin: 0; font-size: 16px; }
  .dbot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 11px 16px 15px; }
  .dbot .note { color: var(--dim); font-size: 13px; }
  .dbot button, .dtop button { border: 1px solid var(--line); background: #fff; border-radius: 8px;
    padding: 6px 11px; font: inherit; cursor: pointer; }
  .dtop button { margin-left: auto; }
  @media (max-width: 640px) { .grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); } }
</style>
</head>
<body>
<header>
  <h1>${all.length} designs, cut through the 50&nbsp;mm box</h1>
  <div class="sub">${all.filter(r => !r.native).length} from the pattern library and ${all.filter(r => r.native).length} of this project's own generators, as a through-cut on the closed ring of four walls, margin 3&nbsp;mm, wall 1.6&nbsp;mm &mdash; the app's own cut. Click a card for the full render.</div>
  <div class="bar">
    <input type="search" id="q" placeholder="Search a name or a tag&hellip;" autocomplete="off">
    <span class="seg" id="size">
      <button data-v="w50" aria-pressed="true">50&nbsp;mm repeat</button>
      <button data-v="w25" aria-pressed="false">25&nbsp;mm repeat</button>
    </span>
    <span class="seg" id="orient">
      <button data-v="" aria-pressed="true">As drawn</button>
      <button data-v="i" aria-pressed="false">Inverted</button>
    </span>
    <span class="seg" id="mode">
      <button data-v="" aria-pressed="true" title="The four walls unfold as one sheet, so the pattern runs round the corners">Wrapped</button>
      <button data-v="f" aria-pressed="false" title="Each wall is cut on its own, with its own 3 mm margin all round">Per face</button>
    </span>
    <span class="seg" id="state">
      <button data-v="all" aria-pressed="true">All</button>
      <button data-v="whole" aria-pressed="false">One piece</button>
      <button data-v="thin" aria-pressed="false">Thin necks</button>
      <button data-v="broke" aria-pressed="false">Falls apart</button>
    </span>
    <span class="count" id="count"></span>
  </div>
</header>
<main><div class="grid" id="grid"></div><div class="empty" id="empty" hidden>Nothing matches.</div></main>
<footer>
  <p>Rendered 2026-09-19 by <code>planning/cut-renders-2026-09-19/render-cut.ts</code>, the same cut
  <code>sweep-cut.ts</code> measures.</p>
  <p><em>too fine to print</em> is the share of the design the minimum-feature filter erodes before
  the tool is built. That design wants a bigger repeat; it is not a reject.</p>
  <p><strong>Wrapped</strong> unfolds the four walls into one sheet, so the pattern runs continuously
  round the corners and a single 3&nbsp;mm margin follows the rim. <strong>Per face</strong> cuts each
  wall on its own: the pattern starts again on every face and each gets its own 3&nbsp;mm margin all
  the way round. Both margins meet at a corner, so a per-face box carries roughly a 6&nbsp;mm solid
  post at each vertical edge &mdash; which is the point of it. Every panel is framed and the box is a
  rigid cage rather than one wrapped skin, so a design that saws a wrapped box into rings can come out
  in one piece.</p>
  <p><em>on a bigger wall, only &hellip; holds</em> is the library's own ring measurement, and it can
  honestly disagree with the picture beside it. This box's walls are only about 44&nbsp;mm between
  the margins, so a repeat too tall to fit whole never got the chance to cut anything loose &mdash;
  the solid margin held it in. The ring has no such accident of size.</p>
  <p>How it was made, and the wave defect found while making it:
  <code>planning/cut-renders-2026-09-19/REPORT-2026-09-19.md</code>.</p>
</footer>

<dialog id="dlg">
  <div class="dtop"><h2 id="dtitle"></h2><button id="dclose">Close</button></div>
  <img id="dimg" alt="">
  <div class="dbot">
    <span class="note" id="dnote"></span>
    <button id="dparts" hidden>Show the loose pieces</button>
  </div>
</dialog>

<script>
const DATA = ${JSON.stringify(all)};
const SUMMARY = ${JSON.stringify(Object.fromEntries(KEYS.map(k => [k, counts(k)])))};
// fixtures/box-50.stl before anything is cut out of it
const SOLID = 18992.4;
let size = 'w50', orient = '', mode = '', state = 'all', q = '';

const key = () => size + orient + mode;
const cut = (r) => r[key()];
// Which way round this design survives a through-cut, from the library's own ring
// measurement. That is a different question from what the picture shows, and the
// two can disagree honestly: this box's walls are only about 44 mm between the
// margins, so a repeat too tall to fit whole never got a chance to cut anything
// loose and the solid margin held it. The ring has no such accident of size, so it
// answers for any wall big enough to repeat on.
const survives = (r) => r.cutAs === 1 ? '' : (r.cutInv === 1 ? 'i' : null);
const stateOf = (c) => !c || c.skipped || c.error ? 'none'
  : c.parts > 1 ? 'broke' : (c.thin > 1 ? 'thin' : 'whole');
const label = (c) => {
  if (!c) return 'not rendered';
  if (c.skipped) return c.skipped;
  if (c.error) return c.error;
  if (c.parts > 1) return 'falls into ' + c.parts + ' pieces';
  if (c.thin > 1) return 'holds on necks too thin to print (' + c.thin + ')';
  return 'one printable piece';
};
// A design far finer than the nozzle is eroded away before it ever reaches the
// tool. The box then comes back almost untouched, which reads as "one piece" and
// is, but for the wrong reason. How much was lost tells that apart from a design
// that is simply sparse.
const barely = (c) => c && c.lost > 0.5;
const lostPct = (c) => Math.round(c.lost * 100) + '%';

const grid = document.getElementById('grid'), empty = document.getElementById('empty');
function draw() {
  const needle = q.trim().toLowerCase();
  const shown = DATA.filter(r => {
    const c = cut(r);
    if (state !== 'all' && stateOf(c) !== state) return false;
    if (!needle) return true;
    return r.title.toLowerCase().includes(needle) || r.slug.includes(needle)
      || (r.tags || []).some(t => t.includes(needle));
  });
  grid.innerHTML = shown.map(r => {
    const c = cut(r), st = stateOf(c);
    const img = st === 'none' ? '' :
      '<img loading="lazy" src="img/' + r.slug + '-' + key() + '-t.webp" alt="' + r.title + ' cut through the box">';
    const fine = barely(c) ? '<span class="badge thin">' + lostPct(c) + ' too fine to print</span>' : '';
    // only worth saying when you are not already looking at that side
    // the ring measurement is about a pattern running round corners, which is the
    // one thing per-face mode does not do -- so the hint belongs only to wrapped
    const other = !mode && survives(r) !== null && survives(r) !== orient
      ? '<span class="badge">on a bigger wall, only ' + (survives(r) ? 'inverted' : 'as drawn') + ' holds</span>' : '';
    return '<article class="card" data-slug="' + r.slug + '">' + img +
      '<div class="meta"><div class="name">' + r.title + '</div>' +
      '<div class="tags">' + (r.tags || []).join(' &middot; ') + '</div>' +
      '<span class="badge ' + st + '">' + label(c) + '</span> ' + fine + ' ' + other + '</div></article>';
  }).join('');
  empty.hidden = shown.length > 0;
  const s = SUMMARY[key()];
  document.getElementById('count').textContent =
    shown.length + ' of ' + DATA.length + '  \\u2014  ' + s.whole + ' whole, ' + s.thin + ' on thin necks, ' + s.broken + ' in pieces';
}

document.getElementById('q').addEventListener('input', e => { q = e.target.value; draw(); });
for (const [id, set] of [['size', v => size = v], ['orient', v => orient = v], ['mode', v => mode = v], ['state', v => state = v]]) {
  document.getElementById(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    for (const other of e.currentTarget.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === b));
    set(b.dataset.v); draw();
  });
}

const dlg = document.getElementById('dlg'), dimg = document.getElementById('dimg');
const dtitle = document.getElementById('dtitle'), dnote = document.getElementById('dnote');
const dparts = document.getElementById('dparts');
let open = null, showingParts = false;
function paint() {
  const c = cut(open);
  dimg.src = 'img/' + open.slug + '-' + key() + (showingParts ? '-parts' : '') + '.png';
  dparts.textContent = showingParts ? 'Show it as printed' : 'Show the loose pieces';
  dnote.textContent = (orient ? 'Inverted. ' : '') + (mode ? 'Each face cut on its own. ' : '') + label(c)
    + (c && c.volume ? '  \\u2014  ' + c.volume.toLocaleString() + ' of ' + SOLID.toLocaleString() + ' mm\\u00b3 left' : '')
    + '  \\u2014  ' + (size === 'w50' ? '50' : '25') + ' mm repeat'
    + (barely(c) ? '  \\u2014  too fine to cut at this size: the design erodes below the nozzle before it reaches the tool' : '');
}
grid.addEventListener('click', e => {
  const card = e.target.closest('.card'); if (!card) return;
  open = DATA.find(r => r.slug === card.dataset.slug);
  const c = cut(open); if (stateOf(c) === 'none') return;
  showingParts = false;
  dtitle.textContent = open.title;
  dparts.hidden = !(c.parts > 1);
  paint(); dlg.showModal();
});
dparts.addEventListener('click', () => { showingParts = !showingParts; paint(); });
document.getElementById('dclose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

draw();
</script>
</body>
</html>
`

writeFileSync(new URL('index.html', OUT), html)
console.log(`${all.length} designs -> ${fileURLToPath(new URL('index.html', OUT))}`)
for (const key of KEYS) {
  const c = counts(key)
  const how = key.includes('i') ? 'inverted' : 'as drawn'
  const lay = key.endsWith('f') ? 'per face' : 'wrapped '
  console.log(`  ${how.padEnd(9)} ${lay} at a ${key.replace(/\D/g, '')} mm repeat: ${c.whole} whole, ${c.thin} on sub-nozzle necks, ${c.broken} in pieces, ${c.none} not cut`)
}
