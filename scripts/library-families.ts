/**
 * First pass of the library's appearance categories: a rule per slug stem,
 * written out as explicit per-design metadata in
 * src/patterns/library/families.json so the second pass (looking at each
 * design and correcting it) edits data rather than rules.
 *
 *   node --import ./tests/register.mjs scripts/library-families.ts
 *
 * Re-running keeps any entry marked `reviewed: true` as it is.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { libraryPatterns } from '../src/patterns/library/index.ts'
import type { Family } from '../src/patterns/catalogTypes.ts'

interface Assignment { family: Family; shapes: string[]; reviewed?: boolean }

/** slug stem (the slug without its trailing -N) -> where it goes */
const BY_STEM: Record<string, [Family, ...string[]]> = {
  // grids & holes: the design reads as a lattice of openings or a wall of blocks
  'plus': ['grids', 'crosses'], 'squares-and-plus': ['grids', 'crosses', 'squares'],
  'brick-wall': ['grids', 'squares'], 'checkerboard': ['grids', 'squares'],
  'squares': ['grids', 'squares'], 'rectangles-and-squares': ['grids', 'squares'],
  'railroad': ['grids'], 'cross-section': ['grids'], 'tiles': ['grids', 'squares'],
  'hexagon': ['grids', 'hexagons'], 'overlapping-hexagons': ['grids', 'hexagons'],
  'interlocked-hexagons': ['grids', 'hexagons'], 'octagons': ['grids', 'mixed'],
  // lines & waves
  'waves': ['lines'], 'chevron': ['lines'], 'straight-lines': ['lines'], 'stripes': ['lines'],
  'lines': ['lines'], 'herringbone': ['lines'], 'squiggle': ['lines'], 'pipes': ['lines'],
  'zebra': ['lines'],
  // weaves & knots
  'rope': ['weaves'], 'greek-key': ['weaves'],
  // tiles & geometry, with a shape chip each
  'triangles': ['tiles', 'triangles'], 'inverted-triangles': ['tiles', 'triangles'],
  'squares-and-triangles': ['tiles', 'triangles', 'squares'],
  'diamonds': ['tiles', 'diamonds'], 'adjointed-diamonds': ['tiles', 'diamonds'],
  'squares-and-diamonds': ['tiles', 'diamonds', 'squares'], 'circles-and-diamonds': ['tiles', 'diamonds', 'circles'],
  'circles': ['tiles', 'circles'], 'concentric-circles': ['tiles', 'circles'], 'adjointed-circles': ['tiles', 'circles'],
  'semicircles': ['tiles', 'circles'], 'squares-and-circles': ['tiles', 'circles', 'squares'],
  'squares-and-squares': ['tiles', 'squares'], 'cubes': ['tiles', 'squares'], 'stained-glass': ['tiles', 'squares'],
  'stars': ['tiles', 'stars'], 'squares-and-stars': ['tiles', 'stars', 'squares'], 'stars-and-lines': ['tiles', 'stars'],
  'geometric': ['tiles', 'mixed'], 'new': ['tiles', 'mixed'],
  // organic & cellular
  'scales': ['organic'], 'blobs': ['organic'], 'patches': ['organic'], 'sprinkles': ['organic'],
  'double-bubble': ['organic'], 'eyes': ['organic'], 'jigsaw': ['organic'], 'terrazzo': ['organic'],
  // nature & decorative, with a sub-bucket each
  'flower': ['nature', 'floral'], 'leaves': ['nature', 'floral'], 'batik': ['nature', 'textile'],
  'plaid-pattern': ['nature', 'textile'], 'songket': ['nature', 'textile'],
  'chinese': ['nature', 'cultural'], 'japanese-pattern': ['nature', 'cultural'], 'mexican-pattern': ['nature', 'cultural'],
  'moroccan': ['nature', 'cultural'], 'ethnic-pattern': ['nature', 'cultural'], 'tribal': ['nature', 'cultural'],
  'african': ['nature', 'cultural'], 'egyptian': ['nature', 'cultural'], 'lanterns': ['nature', 'cultural'],
  'christmas-tree': ['nature', 'holiday'], 'candy-cane': ['nature', 'holiday'], 'christmas-bells': ['nature', 'holiday'],
  'christmas-pattern': ['nature', 'holiday'], 'snowflakes': ['nature', 'holiday'], 'christmas-tree-balls': ['nature', 'holiday'],
  'santa-claus': ['nature', 'holiday'], 'christmas-gift': ['nature', 'holiday'], 'halloween': ['nature', 'holiday'],
  'memphis': ['nature', 'abstract'], 'doodle': ['nature', 'abstract'],
}

/** designs whose slug stem lies, corrected by their own tags or a look */
const BY_SLUG: Record<string, [Family, ...string[]]> = {
  'japanese-pattern-7': ['weaves'], // interlocked bamboo
  'batik-2': ['nature', 'floral'], 'batik-4': ['nature', 'floral'], 'batik-5': ['nature', 'floral'],
  'batik-6': ['nature', 'floral'], 'batik-7': ['nature', 'floral'],
}

const OUT = new URL('../src/patterns/library/families.json', import.meta.url)
let previous: Record<string, Assignment> = {}
try { previous = JSON.parse(readFileSync(OUT, 'utf8')) } catch { /* first run */ }

const out: Record<string, Assignment> = {}
const unmatched: string[] = []
for (const p of libraryPatterns) {
  const kept = previous[p.slug]
  if (kept?.reviewed) { out[p.slug] = kept; continue }
  const stem = p.slug.replace(/-\d+$/, '')
  const rule = BY_SLUG[p.slug] ?? BY_STEM[stem]
  if (!rule) { unmatched.push(p.slug); out[p.slug] = { family: 'tiles', shapes: ['mixed'] }; continue }
  const [family, ...shapes] = rule
  out[p.slug] = { family, shapes }
}
writeFileSync(fileURLToPath(OUT), JSON.stringify(out, null, 1) + '\n')
console.log(`${Object.keys(out).length} designs assigned; ${unmatched.length} fell back to tiles/mixed${unmatched.length ? ': ' + unmatched.join(' ') : ''}`)
