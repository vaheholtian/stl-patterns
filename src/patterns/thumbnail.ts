/**
 * One consistent thumbnail for every pattern: the generated feature in black on
 * white material, repeated across a fixed square window of wall so scale reads
 * the same across cards. Built ahead of time for the catalog's native variants
 * (scripts/build-thumbs.ts) and on demand for saved designs.
 */
import type { Pt } from './types'

/** millimetres of wall a thumbnail shows, on each side */
export const THUMB_WINDOW_MM = 100

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100
  return (Object.is(r, -0) ? 0 : r).toString()
}

/** Tile polygons (feature, Y up, mm) as one SVG path in Y-down tile space. */
export function polygonsPathD(polygons: Pt[][], height: number): string {
  const parts: string[] = []
  for (const poly of polygons) {
    if (poly.length < 3) continue
    parts.push('M' + poly.map(([x, y]) => `${fmt(x)},${fmt(height - y)}`).join('L') + 'Z')
  }
  return parts.join('')
}

/**
 * The markup is inlined into the page rather than loaded as an image, so the
 * bundle carries it (one lazy chunk per variant), it works offline with no
 * extra precache list, and it paints through the ordinary DOM path. `key`
 * keeps the internal ids distinct when several thumbnails share a page.
 */
export function thumbnailSvg(tile: { width: number; height: number }, polygons: Pt[][], windowMm = THUMB_WINDOW_MM, key = 'thumb'): string {
  const S = fmt(windowMm)
  const d = polygonsPathD(polygons, tile.height)
  const id = key.replace(/[^A-Za-z0-9_-]/g, '_')
  // explicit copies rather than an SVG <pattern> fill, which paints slowly at small sizes
  const across = Math.max(1, Math.ceil(windowMm / tile.width)), down = Math.max(1, Math.ceil(windowMm / tile.height))
  const copies: string[] = []
  for (let y = 0; y < down; y++) for (let x = 0; x < across; x++) {
    copies.push(x === 0 && y === 0 ? `<use href="#t-${id}"/>` : `<use href="#t-${id}" x="${fmt(x * tile.width)}" y="${fmt(y * tile.height)}"/>`)
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" aria-hidden="true">` +
    `<defs><path id="t-${id}" fill="#000" fill-rule="evenodd" d="${d}"/><clipPath id="c-${id}"><rect width="${S}" height="${S}"/></clipPath></defs>` +
    `<rect width="${S}" height="${S}" fill="#fff"/><g clip-path="url(#c-${id})">${copies.join('')}</g></svg>`
  )
}

