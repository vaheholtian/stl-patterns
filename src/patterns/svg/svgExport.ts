// Export a Tile (src/patterns/types.ts) to an SVG string, in millimetres.
// This is the inverse of svgImport's coordinate convention: tiles are
// Y-up with the origin at the bottom-left, SVG is Y-down, so every point
// is flipped back with y_svg = height - y_mm.

import type { Pt, Tile, TileCurve } from '../types'

interface ExportOptions {
  ribWidth?: number
  showBox?: boolean
  repeat?: number
}

function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return (Object.is(r, -0) ? 0 : r).toString()
}

function polygonToPathD(poly: Pt[], height: number): string {
  if (poly.length === 0) return ''
  const pts = poly.map(([x, y]) => `${fmt(x)},${fmt(height - y)}`)
  return `M${pts.join('L')}Z`
}

function curveToPathD(curve: TileCurve, height: number): string {
  if (curve.points.length === 0) return ''
  const pts = curve.points.map(([x, y]) => `${fmt(x)},${fmt(height - y)}`)
  return `M${pts.join('L')}${curve.closed ? 'Z' : ''}`
}

export function exportTileSvg(tile: Tile, opts: ExportOptions = {}): string {
  const ribWidth = opts.ribWidth ?? tile.ribWidth
  const showBox = opts.showBox ?? false
  const repeat = Math.max(1, Math.round(opts.repeat ?? 1))

  const W = tile.width
  const H = tile.height

  const polyD = tile.polygons.map((p) => polygonToPathD(p, H)).filter(Boolean).join(' ')
  const curveD = tile.curves.map((c) => curveToPathD(c, H)).filter(Boolean).join(' ')

  const layers: string[] = []
  if (polyD) layers.push(`<path fill="#000" fill-rule="evenodd" d="${polyD}"/>`)
  if (curveD) {
    layers.push(
      `<path fill="none" stroke="#000" stroke-width="${fmt(ribWidth)}" stroke-linecap="round" stroke-linejoin="round" d="${curveD}"/>`,
    )
  }

  const body: string[] = [`<g id="tile">${layers.join('')}</g>`]
  for (let ry = 0; ry < repeat; ry++) {
    for (let rx = 0; rx < repeat; rx++) {
      if (rx === 0 && ry === 0) continue
      body.push(`<use href="#tile" xlink:href="#tile" x="${fmt(rx * W)}" y="${fmt(ry * H)}"/>`)
    }
  }

  if (showBox) {
    for (let ry = 0; ry < repeat; ry++) {
      for (let rx = 0; rx < repeat; rx++) {
        body.push(
          `<rect x="${fmt(rx * W)}" y="${fmt(ry * H)}" width="${fmt(W)}" height="${fmt(H)}" fill="none" stroke="#ccc" stroke-width="0.1"/>`,
        )
      }
    }
  }

  const totalW = W * repeat
  const totalH = H * repeat

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${fmt(totalW)}mm" height="${fmt(totalH)}mm" viewBox="0 0 ${fmt(totalW)} ${fmt(totalH)}">` +
    `${body.join('')}</svg>`
  )
}
