import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useTileStore, resolveDef, type ResolvedDef, type TileDef, type SavedTile } from '../state/tileStore'
import { generators, generatorById, defaultParams } from '../patterns'
import type { Generator, GeneratorParam, ParamValue, Pt, Tile } from '../patterns/types'
import { polygonsArea } from '../patterns/pipeline'
import { importSvg } from '../patterns/svg/svgImport'
import { exportTileSvg } from '../patterns/svg/svgExport'
import { downloadBlob } from '../io/download'
import { useIsMobile } from './useIsMobile'
import { usePwa } from './usePwa'

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
  const title = locked ? `${p.hint ? p.hint + '. ' : ''}Held by the Seamless switch` : p.hint
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

/** Draw polygons (even-odd) repeated in a grid on a canvas, in CSS pixels. */
function drawPreview(canvas: HTMLCanvasElement, tile: Tile | null, polygons: Pt[][], repeat: number) {
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
  const path = new Path2D()
  for (let ry = 0; ry < repeat; ry++) {
    for (let rx = 0; rx < repeat; rx++) {
      const tx = rx * tile.width, ty = ry * tile.height
      for (const poly of polygons) {
        poly.forEach(([x, y], i) => {
          const px = ox + (x + tx) * s, py = oy - (y + ty) * s
          if (i === 0) path.moveTo(px, py); else path.lineTo(px, py)
        })
        path.closePath()
      }
    }
  }
  ctx.fillStyle = '#1a1a1a'
  ctx.fill(path, 'evenodd')
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
function Preview({ tile, polygons, repeat }: { tile: Tile | null; polygons: Pt[][]; repeat: number }) {
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
    if (canvasRef.current) drawPreview(canvasRef.current, tile, polygons, repeat)
  })
  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  )
}

export default function PatternScreen() {
  const def = useTileStore((s) => s.def)
  const resolved = resolveDef(def)
  const tile = useTileStore((s) => s.tile)
  const polygons = useTileStore((s) => s.polygons)
  const warnings = useTileStore((s) => s.warnings)
  const saved = useTileStore((s) => s.saved)
  const ts = useTileStore.getState
  const [repeat, setRepeat] = useState(3)
  const [error, setError] = useState<string | null>(null)
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
      ts().setDef({
        name: file.name.replace(/\.svg$/i, ''),
        generatorId: 'svg',
        svgTile: res.tile,
        svgSubtract: res.subtract,
        params: { ...def.params, svgWidth: res.tile.width, ribWidth: res.tile.ribWidth },
      })
      ts().setResult(res.tile, [], res.warnings)
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
      def={def} resolved={resolved} gen={gen} tile={tile} polygons={polygons} warnings={warnings}
      saved={saved} error={error} repeat={repeat} setRepeat={setRepeat} mobile={mobile}
      onSvgFile={onSvgFile} rescaleSvg={rescaleSvg} exportSvg={exportSvg} exportJson={exportJson}
      importJson={importJson} share={share}
    />
  )

  if (mobile) {
    return (
      <MobilePattern preview={<Preview tile={tile} polygons={polygons} repeat={repeat} />} repeat={repeat} setRepeat={setRepeat} tile={tile}>
        {panels}
      </MobilePattern>
    )
  }
  return (
    <div className="pattern">
      <div className="sidebar">{panels}</div>
      <Preview tile={tile} polygons={polygons} repeat={repeat} />
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
        <div className="preview-bar">
          <span className="muted">{tile ? `${tile.width.toFixed(1)} × ${tile.height.toFixed(1)} mm` : 'no tile'}</span>
          <span className="spacer" />
          {[1, 2, 3, 4].map((n) => (
            <button key={n} className={'small' + (repeat === n ? ' active' : '')} onClick={() => setRepeat(n)}>{n}×</button>
          ))}
        </div>
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
  saved: SavedTile[]
  error: string | null
  repeat: number
  setRepeat: (n: number) => void
  mobile: boolean
  onSvgFile: (f: File) => void
  rescaleSvg: (w: number) => void
  exportSvg: () => void
  exportJson: () => void
  importJson: (f: File) => void
  share: (kind: 'svg' | 'library') => void
}

function Panels(props: PanelProps) {
  const { def, resolved, gen, tile, polygons, warnings, saved, error, repeat, setRepeat, mobile } = props
  const ts = useTileStore.getState
  const pwa = usePwa()
  return (
    <>
      <div className="section">
        <h3>Tile</h3>
        <div className={mobile ? 'field' : 'row'}>
          <label>Name</label>
          <input type="text" style={mobile ? undefined : { width: 150 }} value={def.name} onChange={(e) => ts().setDef({ name: e.target.value })} />
        </div>
        <div className={mobile ? 'field' : 'row'}>
          <label>Generator</label>
          <select
            style={mobile ? undefined : { width: 150 }}
            value={def.generatorId}
            onChange={(e) => {
              const g = generatorById(e.target.value)
              ts().setDef({ generatorId: e.target.value, params: g ? defaultParams(g) : def.params, name: g ? g.name : def.name, svgTile: undefined, svgSubtract: undefined,
                invert: Boolean(g?.cutoutDefault), connectMaterial: Boolean(g?.cutoutDefault), seamless: true, mirror: false })
            }}
          >
            {generators.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value="svg">Imported SVG</option>
          </select>
        </div>
        {gen && <div className="muted">{gen.description}</div>}
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
          {gen.params.map((p) => (
            <ParamControl key={p.key} p={p} touch={mobile} value={resolved.params[p.key] ?? p.default} locked={resolved.lockedParams.has(p.key)} onChange={(v) => ts().setParam(p.key, v)} />
          ))}
        </div>
      )}

      <div className="section">
        <h3>Feature</h3>
        <div className="muted">Black is the feature: removed by through-cut or recess, added by emboss. White remains in a through-cut.</div>
        <div className="row">
          <label>Invert (feature ↔ material)</label>
          <input type="checkbox" checked={def.invert} onChange={(e) => ts().setDef({ invert: e.target.checked })} />
        </div>
        <div className="row">
          <label htmlFor="connect-material" title="Join the kept material with rib-width bridges and matched connections on opposite tile edges. Applies to existing patterns and SVGs too.">Connect material across repeats</label>
          <input id="connect-material" type="checkbox" checked={Boolean(def.connectMaterial)} onChange={(e) => ts().setDef({ connectMaterial: e.target.checked })} />
        </div>
        {def.connectMaterial && <div className="muted">Bridges join the ribs across both repeat directions, without a frame grid. Check the 3D result where the surface crops or scales the pattern.</div>}
        <div className="row">
          <label title="Hold every setting that would break seamless repetition: snaps parameters and forces Mirror on for patterns that need it">Seamless</label>
          <input type="checkbox" checked={def.seamless !== false} onChange={(e) => ts().setDef({ seamless: e.target.checked })} />
        </div>
        <div className="row">
          <label title={resolved.mirrorForced ? 'Required by the Seamless switch: this pattern is not seamless on its own' : 'Reflect the tile into a 2 x 2 kaleidoscope so any pattern repeats seamlessly (doubles the tile size)'}>
            Mirror (kaleidoscope){resolved.mirrorForced ? ' · required for seamless' : ''}
          </label>
          <input type="checkbox" checked={resolved.mirror} disabled={resolved.mirrorForced} onChange={(e) => ts().setDef({ mirror: e.target.checked })} />
        </div>
        {!mobile && (
          <div className="row">
            <label>Preview repeat</label>
            <select value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
              <option value={1}>1 × 1</option>
              <option value={2}>2 × 2</option>
              <option value={3}>3 × 3</option>
              <option value={4}>4 × 4</option>
            </select>
          </div>
        )}
        <div className="muted">
          {tile ? `${tile.width.toFixed(1)} × ${tile.height.toFixed(1)} mm · ${polygons.length} shapes · feature ${(100 * polygonsArea(polygons) / (tile.width * tile.height)).toFixed(0)}% of tile` : 'no tile'}
        </div>
        {warnings.map((w, i) => <div key={i} className={tile?.notes?.includes(w) || w.startsWith('Kept material:') ? 'muted' : 'danger'}>{w}</div>)}
        {error && <div className="danger">{error}</div>}
      </div>

      <div className="section">
        <h3>Library</h3>
        <div className="row wrap">
          <button className="small" onClick={() => ts().save()}>Save tile</button>
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
          {!saved.length && <div className="muted">No saved tiles yet. The current tile is what the Apply screen uses.</div>}
        </div>
      </div>

      {mobile && (
        <div className="section">
          <h3>On a phone</h3>
          <div className="muted">
            Wrapping a pattern onto a part needs the desktop app: it loads your 3MF and does the 3D work.
            Save tiles here, then use <b>Send library</b> to get them across and <b>Import library</b> on the desktop.
          </div>
          {pwa.canInstall && <div className="row" style={{ marginTop: 8 }}><button className="small primary" onClick={pwa.install}>Add to home screen</button></div>}
          {pwa.iosHint && <div className="muted" style={{ marginTop: 8 }}>To install: tap the share button, then <b>Add to Home Screen</b>.</div>}
        </div>
      )}
    </>
  )
}
