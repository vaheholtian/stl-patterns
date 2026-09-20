import { useEffect, useMemo, useRef, useState } from 'react'
import { libraryPatterns, libraryPattern } from '../patterns/library'
import type { LibraryPattern } from '../patterns/library/tile'

/**
 * Swatch for one design, drawn straight from the stored path data as an SVG
 * `<pattern>`. The data is already in the bundle, so a browsable grid of all
 * 330 costs no extra assets and no geometry work: the browser tiles them.
 */
function Swatch({ p, repeats = 2 }: { p: LibraryPattern; repeats?: number }) {
  const id = `lib-${p.slug}`
  // A square window `repeats` repeat-boxes wide, so every swatch shows the same
  // patch of wall. Sizing the window to the tile instead -- w*repeats by
  // h*repeats -- reads as the obvious thing and is wrong: a wide tile makes a
  // wide viewBox, and `slice` crops it back to about one tile inside a square
  // card. That crop cancels the scale difference exactly, so brick-wall-1 (one
  // brick to a box) and brick-wall-2 (two) looked identical here even though at
  // the same repeat width their bricks differ two to one.
  const side = p.w * repeats
  // rib width is an absolute millimetre value: show the 1.2 mm default at the
  // 50 mm default repeat, converted into this design's own units
  const stroke = 1.2 * (p.w / 50)
  return (
    <svg className="lib-swatch" viewBox={`0 0 ${side} ${side}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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

/** What the measurements have to say about a design, as short chips on its card. */
function flagsFor(p: LibraryPattern): { text: string; kind: 'warn' | 'info' }[] {
  const out: { text: string; kind: 'warn' | 'info' }[] = []
  if (p.clipLossPct >= 1) out.push({ text: `loses ${p.clipLossPct.toFixed(0)}% at the seam`, kind: 'warn' })
  if (p.ribBreak > 0.42) out.push({ text: 'ribs stop at the seam', kind: 'warn' })
  // which side is material decides whether a through-cut severs the box, and the
  // invert checkbox flips that, so say which way round rather than condemning it
  if (!p.cutAs && !p.cutInv) out.push({ text: 'nothing to cut', kind: 'warn' })
  else if (p.cutAs !== 1 && p.cutInv !== 1) out.push({ text: `severs a cut box either way (${p.cutAs}/${p.cutInv} pieces)`, kind: 'warn' })
  else if (p.cutAs !== 1) out.push({ text: 'cut it inverted', kind: 'info' })
  if (p.mode !== 'fill') out.push({ text: 'rib width applies', kind: 'info' })
  if (p.layers.length > 1) out.push({ text: `${p.layers.length} layers`, kind: 'info' })
  return out
}

const ALL_TAGS = [...new Set(libraryPatterns.flatMap((p) => p.tags))].sort()

export function PatternLibraryPicker({ value, onPick }: { value: string; onPick: (slug: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [cleanOnly, setCleanOnly] = useState(false)
  const [cuttableOnly, setCuttableOnly] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const current = libraryPattern(value)

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return libraryPatterns.filter((p) => {
      if (tag && !p.tags.includes(tag)) return false
      if (cleanOnly && (p.clipLossPct >= 1 || p.ribBreak > 0.42)) return false
      if (cuttableOnly && p.cutAs !== 1 && p.cutInv !== 1) return false
      if (!words.length) return true
      const hay = `${p.title} ${p.slug} ${p.tags.join(' ')}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [query, tag, cleanOnly, cuttableOnly])

  return (
    <div className="row lib-row">
      <label>Design</label>
      <button className="lib-current" onClick={() => setOpen(true)} title="Browse the pattern library">
        {current ? <Swatch p={current} repeats={3} /> : null}
        <span>{current?.title ?? value}</span>
      </button>

      {open && (
        <div className="lib-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="lib-modal" role="dialog" aria-label="Pattern library">
            <div className="lib-head">
              <input
                ref={searchRef}
                type="search"
                placeholder="Search 330 designs by name or tag…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <label className="lib-toggle" title="Hide designs that lose part of their drawing where the copies meet">
                <input type="checkbox" checked={cleanOnly} onChange={(e) => setCleanOnly(e.target.checked)} />
                clean seams only
              </label>
              <label className="lib-toggle" title="Only designs that leave a closed box in one printable piece when cut right through, in at least one orientation">
                <input type="checkbox" checked={cuttableOnly} onChange={(e) => setCuttableOnly(e.target.checked)} />
                survives a through-cut
              </label>
              <button onClick={() => setOpen(false)}>Close</button>
            </div>

            <div className="lib-tags">
              <button className={tag === null ? 'active' : ''} onClick={() => setTag(null)}>all</button>
              {ALL_TAGS.map((t) => (
                <button key={t} className={tag === t ? 'active' : ''} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
              ))}
            </div>

            <div className="lib-grid">
              {shown.map((p) => (
                <button
                  key={p.slug}
                  className={`lib-card${p.slug === value ? ' selected' : ''}`}
                  onClick={() => { onPick(p.slug); setOpen(false) }}
                >
                  <Swatch p={p} />
                  <span className="lib-title">{p.title}</span>
                  <span className="lib-flags">
                    {flagsFor(p).map((f) => <em key={f.text} className={f.kind}>{f.text}</em>)}
                  </span>
                </button>
              ))}
              {!shown.length && <div className="muted">Nothing matches “{query}”{tag ? ` in ${tag}` : ''}.</div>}
            </div>

            <div className="lib-foot muted">
              {shown.length} of {libraryPatterns.length} shown. Designs from pattern.monster, MIT licensed.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
