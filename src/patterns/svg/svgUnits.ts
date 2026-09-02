// Unit conversion helpers for SVG import/export. Everything in this app is
// millimetres; SVG documents may express lengths in a variety of CSS units.

const MM_PER_INCH = 25.4
const PX_PER_INCH = 96
const PT_PER_INCH = 72

/**
 * Convert a raw SVG/CSS length string (e.g. "210mm", "8.5in", "300",
 * "300px", "72pt") to millimetres. A bare number (no unit) or an explicit
 * "px" suffix is treated as a CSS pixel at 96dpi, per the CSS spec. Returns
 * `fallback` if the string is missing or unparseable.
 */
export function lengthToMm(value: string | null | undefined, fallback = 0): number {
  if (!value) return fallback
  const m = /^\s*([+-]?[\d.]+(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value)
  if (!m) return fallback
  const num = parseFloat(m[1])
  if (!Number.isFinite(num)) return fallback
  const unit = m[2].toLowerCase()
  switch (unit) {
    case '':
    case 'px':
      return (num / PX_PER_INCH) * MM_PER_INCH
    case 'mm':
      return num
    case 'cm':
      return num * 10
    case 'in':
      return num * MM_PER_INCH
    case 'pt':
      return (num / PT_PER_INCH) * MM_PER_INCH
    case 'pc':
      return (num / 6) * MM_PER_INCH // 1pc = 1/6in
    case 'q':
      return num / 4 // quarter-millimetre
    default:
      // Unknown/relative unit (e.g. "%"): no physical meaning here, treat
      // the bare number as already being in mm rather than guessing.
      return num
  }
}
