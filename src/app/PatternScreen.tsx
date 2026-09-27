import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useTileStore, resolveDef, type ResolvedDef, type TileDef, type SavedTile } from '../state/tileStore'
import { generatorById, defaultParams, repeatKind, cutAdviceFor, shownParams } from '../patterns'
import { entryForDef, defForVariant, type CatalogEntry, type CatalogVariant } from '../patterns/catalog'
import type { Generator, GeneratorParam, ParamValue, Pt, Tile } from '../patterns/types'
import { polygonsArea } from '../patterns/pipeline'
import { importSvg } from '../patterns/svg/svgImport'
import { tilePeriodicity } from '../patterns/periodic'
import { getManifold } from '../geom/manifold'
import { exportTileSvg } from '../patterns/svg/svgExport'
import { downloadBlob } from '../io/download'
import { useIsMobile } from './useIsMobile'
import { usePwa } from './usePwa'
import { PatternBrowser, CardThumb } from './PatternBrowser'
import { LIVE_CUT_NOTE } from './browserShared'
import { useStore } from '../state/store'
import type { PiecesResult } from '../worker/preview-protocol'
import type { DroppedReport } from '../patterns/generate'

/** Number input that only reports a value once it is complete, so typing "0.5" does not pass through 0. */
function NumberChip({ value, param, onChange, disabled }: { value: number; param: GeneratorParam; onChange: (v: number) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState<string | null>(null)
  if (editing === null) {
    return (
      <button className="chip" disabled={disabled} onClick={() => setEditing(String(value))}>
        {Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, '')}
      </button>
    )
  }
  const commit = () => {
    const n = Number(editing)
    if (Number.isFinite(n)) onChange(param.type === 'int' ? Math.round(n) : n)
    setEditing(null)
  }
  return (
    <input
      className="chip-input"
      type="number"
      inputMode="decimal"
      autoFocus
      value={editing}
      min={param.min}
      max={param.max}
      step={param.step ?? (param.type === 'int' ? 1 : 0.1)}
      onChange={(e) => setEditing(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null) }}
    />
  )
}

function ParamControl({ p, value, onChange, locked, touch }: { p: GeneratorParam; value: ParamValue; onChange: (v: ParamValue) => void; locked?: boolean; touch?: boolean }) {
  const title = locked ? `${p.hint ? p.hint + '. ' : ''}Held to match repeat edges; overrides are under Repeat → Advanced` : p.hint
  const label = locked ? `${p.label} (seamless)` : p.label
  if (p.type === 'boolean') {
    return (
      <div className="row" title={title}>
        <label>{label}</label>
        <input type="checkbox" checked={Boolean(value)} disabled={locked} onChange={(e) => onChange(e.target.checked)} />
      </div>
    )
  }
  if (p.type === 'select') {
    return (
      <div className={touch ? 'field' : 'row'} title={title}>
        <label>{label}</label>
        <select value={String(value)} disabled={locked} onChange={(e) => onChange(e.target.value)}>
          {p.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }
  // touch: a wide slider with a tappable value, so the preview follows the drag
  if (touch && p.min !== undefined && p.max !== undefined) {
    return (
      <div className={'param' + (locked ? ' locked' : '')} title={title}>
        <div className="param-head">
          <label>{label}</label>
          <NumberChip value={Number(value)} param={p} disabled={locked} onChange={onChange} />
        </div>
        <input
          type="range"
          disabled={locked}
          value={Number(value)}
          min={p.min}
          max={p.max}
          step={p.step ?? (p.type === 'int' ? 1 : 0.1)}
          onChange={(e) => onChange(p.type === 'int' ? Math.round(Number(e.target.value)) : Number(e.target.value))}
        />
      </div>
    )
  }
  return (
    <div className="row" title={title}>
      <label>{label}</label>
      <input
        type="number"
        disabled={locked}
        value={Number(value)}
        min={p.min}
        max={p.max}
        step={p.step ?? (p.type === 'int' ? 1 : 0.1)}
        onChange={(e) => onChange(p.type === 'int' ? Math.round(Number(e.target.value)) : Number(e.target.value))}
      />
    </div>
  )
}

/** Draw polygons (even-odd) repeated in a grid on a canvas, in CSS pixels. Loose material is tinted. */
function drawPreview(canvas: HTMLCanvasElement, tile: Tile | null, polygons: Pt[][], loose: Pt[][], repeat: number) {
  const ctx = canvas.getContext('2d')!
  const dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const W = canvas.width / dpr, H = canvas.height / dpr
  ctx.fillStyle = '#f4f4f4'
  ctx.fillRect(0, 0, W, H)
  if (!tile) return
  const totalW = tile.width * repeat, totalH = tile.height * repeat
  const s = Math.min((W - 20) / totalW, (H - 20) / totalH)
  const ox = (W - totalW * s) / 2, oy = (H + totalH * s) / 2
  const repeated = (polys: Pt[][]) => {
    const path = new Path2D()
    for (let ry = 0; ry < repeat; ry++) {
      for (let rx = 0; rx < repeat; rx++) {
        const tx = rx * tile.width, ty = ry * tile.height
        for (const poly of polys) {
          poly.forEach(([x, y], i) => {
            const px = ox + (x + tx) * s, py = oy - (y + ty) * s
            if (i === 0) path.moveTo(px, py); else path.lineTo(px, py)
          })
          path.closePath()
        }
      }
    }
    return path
  }
  ctx.fillStyle = '#1a1a1a'
  ctx.fill(repeated(polygons), 'evenodd')
  if (loose.length) {
    // what a through-cut drops: drawn one nozzle line inside its outline, as measured
    const path = repeated(loose)
    ctx.fillStyle = 'rgba(224, 72, 72, 0.55)'
    ctx.fill(path, 'evenodd')
    ctx.strokeStyle = 'rgba(224, 72, 72, 0.9)'
    ctx.lineWidth = 1
    ctx.stroke(path)
  }
  // repeat box outline
  ctx.strokeStyle = 'rgba(242,163,58,0.7)'
  ctx.lineWidth = 1
  for (let ry = 0; ry < repeat; ry++) for (let rx = 0; rx < repeat; rx++) {
    ctx.strokeRect(ox + rx * tile.width * s, oy - (ry + 1) * tile.height * s, tile.width * s, tile.height * s)
  }
  // scale bar: 10 mm
  ctx.fillStyle = '#333'
  ctx.fillRect(10, H - 14, 10 * s, 3)
  ctx.font = '11px system-ui'
  ctx.fillText('10 mm', 10, H - 18)
}

/** Canvas that keeps its backing store matched to its box and the pixel ratio. */
function Preview({ tile, polygons, loose, repeat }: { tile: Tile | null; polygons: Pt[][]; loose: Pt[][]; repeat: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [, resized] = useState(0)
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      // the canvas is positioned out of flow, so its size cannot feed back into the wrap
      const side = Math.max(1, Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight)) - 20)
      canvas.style.width = `${side}px`
      canvas.style.height = `${side}px`
      canvas.width = Math.floor(side * dpr)
      canvas.height = Math.floor(side * dpr)
      resized((n) => n + 1)
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (canvasRef.current) drawPreview(canvasRef.current, tile, polygons, loose, repeat)
  })
  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} role="img" aria-label={`Pattern preview, ${repeat} by ${repeat} tiles`} />
    </div>
  )
}

/** Display-only repetition; never changes the saved design or its generated geometry. */
function PreviewBar({ tile, repeat, setRepeat }: { tile: Tile | null; repeat: number; setRepeat: (n: number) => void }) {
  return (
    <div className="preview-bar pattern-preview-bar">
      <span className="muted">{tile ? `${tile.width.toFixed(1)} × ${tile.height.toFixed(1)} mm` : 'No tile'}</span>
      <div className="preview-repeat" role="group" aria-label="Preview repetition (display only)">
        <span className="muted">Preview</span>
        {[1, 2, 3, 4].map((n) => (
          <button key={n} type="button" className={'small' + (repeat === n ? ' active' : '')} aria-label={`Show ${n} by ${n} tiles`} aria-pressed={repeat === n} title="Changes the preview only" onClick={() => setRepeat(n)}>{n}×{n}</button>
        ))}
      </div>
    </div>
  )
}

/** 0 is not zero pieces: it means the design produced nothing at this size. */
function cutPieces(n: number): string {
  return n === 0 ? 'nothing to cut' : n === 1 ? 'holds together' : `${n} pieces`
}

const NO_LOOSE: Pt[][] = []

/** The live piece count for the current tile, with the one-click ways out when it is loose. */
function LiveCut({ pieces, mode, onSwap, onRecess }: {
  pieces: PiecesResult | 'failed' | null
  mode: 'cut' | 'recess' | 'emboss'
  onSwap: () => void
  onRecess: () => void
}) {
  const row = (badge: ReactNode) => <div className="row"><label title={LIVE_CUT_NOTE}>Cut through</label>{badge}</div>
  if (pieces === null) return row(<em className="pb-cut unmeasured">Measuring…</em>)
  if (pieces === 'failed') return row(<em className="pb-cut unmeasured">Not measured</em>)
  const { current, other, strict } = pieces
  const n = current.pieces
  const state = n === 0 ? 'empty' : n === 1 ? 'holds' : 'loose'
  const label = n === 0 ? 'Nothing to cut' : n === 1 ? 'Holds together' : `${n} pieces`
  const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`
  const looseNote = n > 1
    ? `On a ring of wall four repeats around this falls into ${n} pieces: ${plural(current.loosePieces, 'loose piece')} per repeat${current.crumbs ? ` and ${plural(current.crumbs, 'crumb')}` : ''}, tinted red in the preview.`
    : current.crumbs ? `${plural(current.crumbs, 'crumb')} per repeat would fall out, tinted red in the preview.` : ''
  const strictNote = n === 1 && strict > 1 ? 'It holds only through connections barely two nozzle lines wide; a slightly wider rib would be safer.' : ''
  const fixable = n > 1 || current.crumbs > 0
  return (
    <>
      {row(<em className={`pb-cut ${state}`} title={LIVE_CUT_NOTE}>{label}</em>)}
      <div className="muted">{[looseNote, strictNote, `Swapped solid and openings: ${cutPieces(other.pieces)}.`].filter(Boolean).join(' ')}</div>
      {fixable && (
        <div className="row wrap">
          {other.pieces >= 1 && other.pieces < n && <button type="button" className="small" onClick={onSwap}>Swap orientation</button>}
          {mode === 'cut' && <button type="button" className="small" onClick={onRecess} title="A recess or emboss drops nothing; this changes the operation on the Apply screen">Use as recess</button>}
          <span className="muted">or turn on Remove loose pieces or Add connecting bridges below.</span>
        </div>
      )}
    </>
  )
}

export default function PatternScreen() {
  const def = useTileStore((s) => s.def)
  const resolved = resolveDef(def)
  const tile = useTileStore((s) => s.tile)
  const polygons = useTileStore((s) => s.polygons)
  const warnings = useTileStore((s) => s.warnings)
  const pieces = useTileStore((s) => s.pieces)
  const dropped = useTileStore((s) => s.dropped)
  const loose = pieces && pieces !== 'failed' ? pieces.current.loose : NO_LOOSE
  const saved = useTileStore((s) => s.saved)
  const ts = useTileStore.getState
  const [repeat, setRepeat] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const [browserOpen, setBrowserOpen] = useState(false)
  const gen = def.generatorId === 'svg' ? null : generatorById(def.generatorId)

  const mobile = useIsMobile()

  // fill in defaults when the generator changes
  useEffect(() => {
    if (!gen) return
    const defaults = defaultParams(gen)
    const missing = Object.keys(defaults).filter((k) => !(k in def.params))
    if (missing.length) ts().setDef({ params: { ...defaults, ...def.params } })
  }, [gen, def.params, ts])

  // regeneration itself runs app-wide (useTileRegen), so the Apply screen always has a tile

  const onSvgFile = async (file: File) => {
    try {
      const text = await file.text()
      const res = importSvg(text, { widthMm: Number(def.params.svgWidth ?? 0) || undefined, tolerance: 0.15 })
      // Ask the artwork whether it repeats instead of assuming it does not: a tile
      // drawn as a repeat keeps Seamless on without being mirrored into a kaleidoscope.
      const edges = tilePeriodicity(await getManifold(), res.tile)
      const seamless = edges.x && edges.y
      ts().setDef({
        name: file.name.replace(/\.svg$/i, ''),
        generatorId: 'svg',
        svgTile: res.tile,
        svgSubtract: res.subtract,
        svgSeamless: seamless,
        params: { ...def.params, svgWidth: res.tile.width, ribWidth: res.tile.ribWidth },
      })
      ts().setResult(res.tile, [], [...res.warnings, seamless
        ? 'Opposite edges match: this artwork repeats on its own, so Seamless leaves it as drawn.'
        : `Opposite edges do not match (${edges.x ? 'top/bottom' : edges.y ? 'left/right' : 'both directions'}); Seamless will mirror it into a kaleidoscope.`])
      setError(null)
    } catch (e) {
      setError(`SVG import failed: ${(e as Error).message}`)
    }
  }

  const rescaleSvg = (widthMm: number) => {
    const t = def.svgTile
    if (!t || !(widthMm > 0)) return
    const k = widthMm / t.width
    const scale = (polys: Pt[][]) => polys.map((p) => p.map(([x, y]) => [x * k, y * k] as Pt))
    ts().setDef({
      svgTile: { ...t, width: t.width * k, height: t.height * k, polygons: scale(t.polygons), curves: t.curves.map((c) => ({ ...c, points: c.points.map(([x, y]) => [x * k, y * k] as Pt) })), ribWidth: t.ribWidth * k },
      svgSubtract: def.svgSubtract ? scale(def.svgSubtract) : undefined,
      params: { ...def.params, svgWidth: widthMm },
    })
  }

  const svgBlob = () => {
    if (!tile) return null
    const svg = exportTileSvg({ ...tile, polygons, curves: [] }, { showBox: false, repeat: 1 })
    return new Blob([svg], { type: 'image/svg+xml' })
  }
  const exportSvg = () => {
    const blob = svgBlob()
    if (blob) downloadBlob(blob, `${def.name || 'tile'}.svg`)
  }
  const libraryBlob = () => new Blob([JSON.stringify(saved, null, 1)], { type: 'application/json' })
  const exportJson = () => downloadBlob(libraryBlob(), 'stl-patterns-tiles.json')
  const importJson = async (file: File) => {
    try {
      const list = JSON.parse(await file.text())
      if (Array.isArray(list)) ts().importDefs(list)
    } catch (e) { setError(`could not read tile file: ${(e as Error).message}`) }
  }
  /** Hand a file to the phone's share sheet (AirDrop, mail, cloud drive) to get it onto the desktop. */
  const share = async (kind: 'svg' | 'library') => {
    const blob = kind === 'svg' ? svgBlob() : libraryBlob()
    if (!blob) return
    const name = kind === 'svg' ? `${def.name || 'tile'}.svg` : 'stl-patterns-tiles.json'
    const file = new File([blob], name, { type: blob.type })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }) } catch { /* dismissed */ }
    } else {
      downloadBlob(blob, name)
    }
  }

  const panels = (
    <Panels
      def={def} resolved={resolved} gen={gen} tile={tile} polygons={polygons} warnings={warnings} pieces={pieces} dropped={dropped}
      saved={saved} error={error} mobile={mobile}
      onSvgFile={onSvgFile} rescaleSvg={rescaleSvg} exportSvg={exportSvg} exportJson={exportJson}
      importJson={importJson} share={share} openBrowser={() => setBrowserOpen(true)}
    />
  )
  const chooseVariant = (entry: CatalogEntry, variant: CatalogVariant) => ts().setDef(defForVariant(entry, variant))
  const browser = (
    <PatternBrowser
      open={browserOpen} onClose={() => setBrowserOpen(false)} currentId={entryForDef(def)?.entry.id}
      onChoose={chooseVariant} saved={saved} onLoadSaved={(id) => ts().load(id)} onRemoveSaved={(id) => ts().remove(id)}
    />
  )

  if (mobile) {
    return (
      <>
        <MobilePattern preview={<Preview tile={tile} polygons={polygons} loose={loose} repeat={repeat} />} repeat={repeat} setRepeat={setRepeat} tile={tile}>
          {panels}
        </MobilePattern>
        {browser}
      </>
    )
  }
  return (
    <div className="pattern">
      <div className="sidebar">{panels}</div>
      <div className="pattern-preview">
        <Preview tile={tile} polygons={polygons} loose={loose} repeat={repeat} />
        <PreviewBar tile={tile} repeat={repeat} setRepeat={setRepeat} />
      </div>
      {browser}
    </div>
  )
}

const SNAP = [0.62, 0.42, 0.2]

/** Preview pinned on top, controls in a sheet that drags up for more room. */
function MobilePattern({ preview, children, repeat, setRepeat, tile }: { preview: ReactNode; children: ReactNode; repeat: number; setRepeat: (n: number) => void; tile: Tile | null }) {
  const [frac, setFrac] = useState(SNAP[1])
  const rootRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; frac: number; moved: boolean } | null>(null)

  // listeners live on the window so the drag survives the finger leaving the handle
  const startDrag = (e: ReactPointerEvent) => {
    drag.current = { y: e.clientY, frac, moved: false }
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const h = rootRef.current?.clientHeight ?? window.innerHeight
      const dy = ev.clientY - d.y
      if (Math.abs(dy) > 4) d.moved = true
      setFrac(Math.min(SNAP[0], Math.max(SNAP[SNAP.length - 1], d.frac + dy / h)))
      ev.preventDefault()
    }
    const up = () => {
      const d = drag.current
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!d) return
      // a tap cycles the snap points; a drag settles on the nearest one
      setFrac((f) => (d.moved
        ? SNAP.reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a))
        : SNAP[(SNAP.findIndex((s) => Math.abs(s - f) < 0.02) + 1) % SNAP.length]))
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div className="pattern-mobile" ref={rootRef}>
      <div className="preview-pane" style={{ height: `${frac * 100}%` }}>
        {preview}
        <PreviewBar tile={tile} repeat={repeat} setRepeat={setRepeat} />
      </div>
      <div className="sheet">
        <div className="grabber" onPointerDown={startDrag}>
          <span />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

interface PanelProps {
  def: TileDef
  resolved: ResolvedDef
  gen: Generator | null | undefined
  tile: Tile | null
  polygons: Pt[][]
  warnings: string[]
  pieces: PiecesResult | 'failed' | null
  dropped: DroppedReport | undefined
  saved: SavedTile[]
  error: string | null
  mobile: boolean
  onSvgFile: (f: File) => void
  rescaleSvg: (w: number) => void
  exportSvg: () => void
  exportJson: () => void
  importJson: (f: File) => void
  share: (kind: 'svg' | 'library') => void
  openBrowser: () => void
}

function Panels(props: PanelProps) {
  const { def, resolved, gen, tile, polygons, warnings, pieces, dropped, saved, error, mobile } = props
  const ts = useTileStore.getState
  const pwa = usePwa()
  const mode = useStore((s) => s.tileLayout.mode)

  /* Invert decides which side of the drawing is material, and for most patterns
     only one side survives a through-cut -- the same wall drawn inside out gives
     opposite answers. So the control is held at the measured orientation instead
     of sitting on whichever way its generator happened to be written, which for
     four of them was the side that shatters the box. It is a strong default, not
     a prohibition: the measurement is at default parameters on a plain ring of wall, so it can be unlocked. */
  const advice = cutAdviceFor(gen ?? undefined, resolved.params)
  const found = entryForDef(def)
  const automaticRepeat = def.seamless !== false && !def.mirror
  const [unlockedInvert, setUnlockedInvert] = useState(false)
  // an unlock belongs to the pattern it was granted for, so drop it when the
  // pattern changes -- adjusted during render rather than in an effect, so the
  // control never paints unlocked for the new pattern for a frame first
  const lockKey = `${def.generatorId}:${String(resolved.params.pattern ?? '')}`
  const [lastLockKey, setLastLockKey] = useState(lockKey)
  if (lastLockKey !== lockKey) { setLastLockKey(lockKey); setUnlockedInvert(false) }
  const invertLocked = advice?.good != null && !unlockedInvert
  // a rib network that connects by construction takes no bridges
  const bridgesBuiltIn = Boolean(gen?.connectedRibs && def.invert)
  const bridges = !bridgesBuiltIn && Boolean(def.connectMaterial)
  useEffect(() => {
    if (invertLocked && advice && def.invert !== advice.good) ts().setDef({ invert: advice.good as boolean })
  }, [invertLocked, advice, def.invert, ts])
  return (
    <>
      <div className="section">
        <h3>Tile</h3>
        <div className={mobile ? 'field' : 'row'}>
          <label>Name</label>
          <input type="text" style={mobile ? undefined : { width: 150 }} value={def.name} onChange={(e) => ts().setDef({ name: e.target.value })} />
        </div>
        <div className={mobile ? 'field' : 'row'}>
          <label>Pattern</label>
          {/* the thumbnail sits beside the button so the focusable target is text only */}
          <div className="pb-current">
            {found ? <CardThumb entry={found.entry} variant={found.variant} className="pb-mini" /> : <span className="pb-mini pb-placeholder" />}
            <button type="button" className="pb-change" onClick={props.openBrowser} title="Browse every pattern">
              <span className="pb-current-title">{def.generatorId === 'svg' ? 'Imported SVG' : found ? found.entry.title : def.generatorId}</span>
              <span className="muted">Change…</span>
            </button>
          </div>
        </div>
        {found && found.entry.variants.length > 1 && (
          <div className={mobile ? 'field' : 'row'}>
            <label>Variant</label>
            <select
              style={mobile ? undefined : { width: 150 }}
              value={found.variant.id}
              onChange={(e) => {
                const v = found.entry.variants.find((x) => x.id === e.target.value)
                if (v) ts().setDef(defForVariant(found.entry, v))
              }}
            >
              {found.entry.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        )}
        {gen && <div className="muted">{gen.description}</div>}
        {found?.entry.surface && <div className="muted">On the Apply screen this pattern can also be generated directly over the selected surface, instead of laid out as a repeating tile.</div>}
        {gen && repeatKind(gen, resolved.params) === 'motif' && <div className="muted">Motif repeat: matching tile edges does not remove the motif outline or spacing. This is not an all-over surface pattern.</div>}
        {gen && repeatKind(gen, resolved.params) === 'band' && <div className="muted">Band repeat: continues horizontally; stacked rows remain visible bands.</div>}
        {def.generatorId === 'svg' && (
          <div className="muted">
            Black shapes become the feature. Text and strokes must be outlined first.
            <div className="row" style={{ marginTop: 6 }}>
              <label>Width (mm)</label>
              <input type="number" value={Number(def.params.svgWidth ?? 0)} step={1} min={1} onChange={(e) => props.rescaleSvg(Number(e.target.value))} />
            </div>
          </div>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <label style={{ color: 'var(--accent2)', cursor: 'pointer' }}>
            Import SVG…
            <input type="file" accept=".svg" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && props.onSvgFile(e.target.files[0])} />
          </label>
        </div>
      </div>

      {gen && (
        <div className="section">
          <h3>Parameters</h3>
          {/* only the controls that can change this tile: a style's unused gap or a one-layer design's layer count is left out */}
          {shownParams(gen, resolved.params, bridges).map((p) => {
            // the library's design is chosen in the pattern browser, not as a parameter
            if (gen.id === 'library' && p.key === 'pattern') return null
            const raw = resolved.params[p.key] ?? p.default
            const value = typeof raw === 'number' && p.max !== undefined ? Math.min(raw, p.max) : raw
            return <ParamControl key={p.key} p={p} touch={mobile} value={value} locked={resolved.lockedParams.has(p.key)} onChange={(v) => ts().setParam(p.key, v)} />
          })}
        </div>
      )}

      <div className="section">
        <h3>Feature</h3>
        <div className="muted">Black is the feature: removed by through-cut or recess, added by emboss. White remains in a through-cut.</div>
        <LiveCut
          pieces={pieces} mode={mode}
          onSwap={() => { setUnlockedInvert(true); ts().setDef({ invert: !def.invert }) }}
          onRecess={() => useStore.getState().setTileLayout({ mode: 'recess' })}
        />
        <div className="row">
          <label htmlFor="invert-feature">Swap solid and openings{invertLocked ? <span className="locked-tag" title="Held at the orientation that survived the reference cut"> locked</span> : null}</label>
          <input id="invert-feature" type="checkbox" checked={def.invert} disabled={invertLocked} onChange={(e) => ts().setDef({ invert: e.target.checked })} />
        </div>
        {advice && advice.good !== null && invertLocked && (
          <div className="muted">
            Held at the orientation that survived the reference cut at default settings; the other fell into {advice.good ? advice.plain : advice.inverted} pieces.{' '}
            <button type="button" className="as-link" onClick={() => setUnlockedInvert(true)}>Unlock anyway</button>
          </div>
        )}
        {!bridgesBuiltIn && (
          <div className="row">
            <label htmlFor="connect-material" title="Join the kept material with rib-width bridges and matched connections on opposite tile edges. Applies to existing patterns and SVGs too.">Add connecting bridges</label>
            <input id="connect-material" type="checkbox" checked={bridges} onChange={(e) => ts().setDef({ connectMaterial: e.target.checked })} />
          </div>
        )}
        {bridgesBuiltIn ? <div className="muted">The rib network connects across both repeat directions by construction. No additional joining bars are needed.</div> : def.connectMaterial && <div className="muted">Bridges join the ribs across both repeat directions, without a frame grid. Check the 3D result where the surface crops or scales the pattern.</div>}
        <div className="row">
          <label htmlFor="drop-loose" title="Cut away what a through-cut would leave loose: islands, bands and crumbs, with any neck too thin to print that held them on. Refused when they are most of the material.">Remove loose pieces</label>
          <input id="drop-loose" type="checkbox" checked={Boolean(def.dropLoose)} onChange={(e) => ts().setDef({ dropLoose: e.target.checked })} />
        </div>
        {def.dropLoose && dropped && (
          <div className="muted">
            {dropped.refused
              ? `Loose pieces are ${Math.round(100 * dropped.share)}% of the material, so nothing was removed: this orientation does not suit a through-cut.`
              : `Removed ${dropped.pieces} loose piece${dropped.pieces === 1 ? '' : 's'}, ${Math.round(100 * dropped.share)}% of the material.`}
          </div>
        )}
        {def.dropLoose && !dropped && tile && <div className="muted">Nothing loose to remove at these settings.</div>}
        <div className="muted">
          {tile ? `${tile.width.toFixed(1)} × ${tile.height.toFixed(1)} mm · ${polygons.length} shapes · feature ${(100 * polygonsArea(polygons) / (tile.width * tile.height)).toFixed(0)}% of tile` : 'no tile'}
        </div>
        {warnings.map((w, i) => <div key={i} className={tile?.notes?.includes(w) || w.startsWith('Kept material:') ? 'muted' : 'danger'}>{w}</div>)}
        {error && <div className="danger">{error}</div>}
      </div>

      <div className="section repeat-section">
        <h3>Repeat</h3>
        <div className="row repeat-status">
          <span>Repeat behavior</span>
          <strong>{automaticRepeat ? 'Automatic' : 'Custom'}</strong>
        </div>
        <div className="muted">
          {resolved.mirrorForced ? 'Mirrored automatically to match opposite edges. Motifs keep their visible outlines.'
            : resolved.mirror ? 'Mirrored into a kaleidoscope repeat.'
            : def.seamless === false ? 'Edge matching is off; joins may be visible.'
            : 'Uses the pattern’s native repeat, without mirroring.'}
        </div>
        <details className="repeat-advanced">
          <summary>Advanced · manual overrides</summary>
          <div className="row">
            <label htmlFor="repeat-match">Match repeat edges</label>
            <input id="repeat-match" type="checkbox" checked={def.seamless !== false} onChange={(e) => ts().setDef({ seamless: e.target.checked })} />
          </div>
          <div className="row">
            <label htmlFor="repeat-mirror">Mirror into kaleidoscope</label>
            <input id="repeat-mirror" type="checkbox" checked={resolved.mirror} disabled={resolved.mirrorForced} onChange={(e) => ts().setDef({ mirror: e.target.checked })} />
          </div>
          {resolved.mirrorForced && <div className="muted">Mirroring is required to match this pattern’s edges. Turn off Match repeat edges to override it.</div>}
          {resolved.lockedParams.size > 0 && <div className="muted">Some parameters are held to matching values. Turn off Match repeat edges to edit them.</div>}
          <div className="muted">Mirroring doubles the tile width and height. Preview repetition beside the canvas only changes the display.</div>
          {!automaticRepeat && <button type="button" className="small" onClick={() => ts().setDef({ seamless: true, mirror: false })}>Restore automatic</button>}
        </details>
      </div>

      <div className="section">
        <h3>My designs</h3>
        <div className="row wrap">
          <button className="small" onClick={() => ts().save()}>Save design</button>
          {mobile ? (
            <>
              <button className="small" disabled={!tile} onClick={() => props.share('svg')}>Share SVG</button>
              <button className="small" disabled={!saved.length} onClick={() => props.share('library')}>Send library</button>
            </>
          ) : (
            <>
              <button className="small" disabled={!tile} onClick={props.exportSvg}>Export SVG</button>
              <button className="small" disabled={!saved.length} onClick={props.exportJson}>Export library</button>
            </>
          )}
          <label className="small" style={{ color: 'var(--accent2)', cursor: 'pointer' }}>
            Import library
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && props.importJson(e.target.files[0])} />
          </label>
        </div>
        <div className="bodies">
          {saved.map((s) => (
            <div key={s.id} className="body-row" onClick={() => ts().load(s.id)}>
              <span className="name">{s.name}</span>
              <span className="muted">{s.generatorId}</span>
              <button className="small" onClick={(e) => { e.stopPropagation(); ts().remove(s.id) }}>✕</button>
            </div>
          ))}
          {!saved.length && <div className="muted">No saved designs yet. The current tile is what the Apply screen uses; Save design keeps it, with its settings, for later.</div>}
        </div>
      </div>

      {mobile && (
        <div className="section">
          <h3>On a phone</h3>
          <div className="muted">
            Wrapping a pattern onto a part needs the desktop app: it loads your 3MF and does the 3D work.
            Save designs here, then use <b>Send library</b> to get them across and <b>Import library</b> on the desktop.
          </div>
          {pwa.canInstall && <div className="row" style={{ marginTop: 8 }}><button className="small primary" onClick={pwa.install}>Add to home screen</button></div>}
          {pwa.iosHint && <div className="muted" style={{ marginTop: 8 }}>To install: tap the share button, then <b>Add to Home Screen</b>.</div>}
        </div>
      )}
    </>
  )
}
