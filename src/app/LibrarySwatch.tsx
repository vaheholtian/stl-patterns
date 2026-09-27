import type { LibraryPattern } from '../patterns/library/tile'
import { THUMB_WINDOW_MM } from '../patterns/thumbnail'

/**
 * Swatch for one library design, drawn straight from the stored path data as
 * an SVG `<pattern>`. The data is already in the bundle, so a browsable grid
 * of all 330 costs no extra assets and no geometry work: the browser tiles them.
 *
 * The window is the same patch of wall the native thumbnails show, at the
 * design's default 50 mm repeat width, so scale reads the same across cards.
 * Sizing the window to the tile instead reads as the obvious thing and is
 * wrong: a wide tile makes a wide viewBox, and `slice` crops it back to about
 * one tile inside a square card, which cancels the scale difference exactly.
 */
export function LibrarySwatch({ p, windowMm = THUMB_WINDOW_MM, className = 'pb-thumb' }: { p: LibraryPattern; windowMm?: number; className?: string }) {
  const id = `lib-${p.slug}`
  // the design is drawn in its own units; at the 50 mm default repeat, one mm is w/50 units
  const unitsPerMm = p.w / 50
  const side = windowMm * unitsPerMm
  // rib width is an absolute millimetre value: show the 1.2 mm default
  const stroke = 1.2 * unitsPerMm
  return (
    <svg className={className} viewBox={`0 0 ${side} ${side}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <pattern id={id} x="0" y="0" width={p.w} height={p.h} patternUnits="userSpaceOnUse">
          {p.layers.map((d, i) => (
            <path
              key={i}
              d={d}
              fill={p.mode === 'fill' ? 'currentColor' : 'none'}
              stroke={p.mode === 'fill' ? 'none' : 'currentColor'}
              strokeWidth={p.mode === 'fill' ? undefined : stroke}
              strokeLinecap={p.mode === 'stroke-join' ? 'square' : 'round'}
              fillRule="nonzero"
            />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}
