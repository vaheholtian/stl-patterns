import { useEffect, useRef, useState } from 'react'
import { useTileStore } from '../state/tileStore'
import { generators, generatorById, defaultParams } from '../patterns'
import type { GeneratorParam, ParamValue, Pt, Tile } from '../patterns/types'
import { polygonsArea } from '../patterns/pipeline'
import { importSvg } from '../patterns/svg/svgImport'
import { exportTileSvg } from '../patterns/svg/svgExport'
import { downloadBlob } from '../io/download'

function ParamControl({ p, value, onChange }: { p: GeneratorParam; value: ParamValue; onChange: (v: ParamValue) => void }) {
  if (p.type === 'boolean') {
    return (
      <div className="row" title={p.hint}>
        <label>{p.label}</label>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      </div>
    )
  }
  if (p.type === 'select') {
    return (
      <div className="row" title={p.hint}>
        <label>{p.label}</label>
        <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {p.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }
  return (
    <div className="row" title={p.hint}>
      <label>{p.label}</label>
      <input
        type="number"
        value={Number(value)}
        min={p.min}
        max={p.max}
        step={p.step ?? (p.type === 'int' ? 1 : 0.1)}
        onChange={(e) => onChange(p.type === 'int' ? Math.round(Number(e.target.value)) : Number(e.target.value))}
      />
    </div>
  )
}

/** Draw polygons (even-odd) repeated in a grid on a canvas. */
function drawPreview(canvas: HTMLCanvasElement, tile: Tile | null, polygons: Pt[][], repeat: number) {
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
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

export default function PatternScreen() {
  const def = useTileStore((s) => s.def)
  const tile = useTileStore((s) => s.tile)
  const polygons = useTileStore((s) => s.polygons)
  const warnings = useTileStore((s) => s.warnings)
  const saved = useTileStore((s) => s.saved)
  const ts = useTileStore.getState
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [repeat, setRepeat] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const gen = def.generatorId === 'svg' ? null : generatorById(def.generatorId)

  // fill in defaults when the generator changes
  useEffect(() => {
    if (!gen) return
    const defaults = defaultParams(gen)
    const missing = Object.keys(defaults).filter((k) => !(k in def.params))
    if (missing.length) ts().setDef({ params: { ...defaults, ...def.params } })
  }, [gen, def.params, ts])

  // regeneration itself runs app-wide (useTileRegen), so the Apply screen always has a tile

  useEffect(() => {
    if (canvasRef.current) drawPreview(canvasRef.current, tile, polygons, repeat)
  }, [tile, polygons, repeat])

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

  const exportSvg = () => {
    if (!tile) return
    const svg = exportTileSvg({ ...tile, polygons, curves: [] }, { showBox: false, repeat: 1 })
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${def.name || 'tile'}.svg`)
  }
  const exportJson = () => {
    const data = JSON.stringify(saved, null, 1)
    downloadBlob(new Blob([data], { type: 'application/json' }), 'stl-patterns-tiles.json')
  }
  const importJson = async (file: File) => {
    try {
      const list = JSON.parse(await file.text())
      if (Array.isArray(list)) ts().importDefs(list)
    } catch (e) { setError(`could not read tile file: ${(e as Error).message}`) }
  }

  return (
    <div className="pattern">
      <div className="sidebar">
        <div className="section">
          <h3>Tile</h3>
          <div className="row">
            <label>Name</label>
            <input type="text" style={{ width: 150 }} value={def.name} onChange={(e) => ts().setDef({ name: e.target.value })} />
          </div>
          <div className="row">
            <label>Generator</label>
            <select
              style={{ width: 150 }}
              value={def.generatorId}
              onChange={(e) => {
                const g = generatorById(e.target.value)
                ts().setDef({ generatorId: e.target.value, params: g ? defaultParams(g) : def.params, name: g ? g.name : def.name, svgTile: undefined, svgSubtract: undefined })
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
                <input type="number" value={Number(def.params.svgWidth ?? 0)} step={1} min={1} onChange={(e) => rescaleSvg(Number(e.target.value))} />
              </div>
            </div>
          )}
          <div className="row" style={{ marginTop: 6 }}>
            <label style={{ color: 'var(--accent2)', cursor: 'pointer' }}>
              Import SVG…
              <input type="file" accept=".svg" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onSvgFile(e.target.files[0])} />
            </label>
          </div>
        </div>

        {gen && (
          <div className="section">
            <h3>Parameters</h3>
            {gen.params.map((p) => (
              <ParamControl key={p.key} p={p} value={def.params[p.key] ?? p.default} onChange={(v) => ts().setParam(p.key, v)} />
            ))}
          </div>
        )}

        <div className="section">
          <h3>Feature</h3>
          <div className="row">
            <label>Invert (feature ↔ material)</label>
            <input type="checkbox" checked={def.invert} onChange={(e) => ts().setDef({ invert: e.target.checked })} />
          </div>
          <div className="row">
            <label title="Reflect the tile into a 2 x 2 kaleidoscope so any pattern repeats seamlessly (doubles the tile size)">Mirror (kaleidoscope, seamless)</label>
            <input type="checkbox" checked={Boolean(def.mirror)} onChange={(e) => ts().setDef({ mirror: e.target.checked })} />
          </div>
          <div className="row">
            <label>Preview repeat</label>
            <select value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
              <option value={1}>1 × 1</option>
              <option value={2}>2 × 2</option>
              <option value={3}>3 × 3</option>
              <option value={4}>4 × 4</option>
            </select>
          </div>
          <div className="muted">
            {tile ? `${tile.width.toFixed(1)} × ${tile.height.toFixed(1)} mm · ${polygons.length} shapes · feature ${(100 * polygonsArea(polygons) / (tile.width * tile.height)).toFixed(0)}% of tile` : 'no tile'}
          </div>
          {warnings.map((w, i) => <div key={i} className="danger">{w}</div>)}
          {error && <div className="danger">{error}</div>}
        </div>

        <div className="section">
          <h3>Library</h3>
          <div className="row wrap">
            <button className="small" onClick={() => ts().save()}>Save tile</button>
            <button className="small" disabled={!tile} onClick={exportSvg}>Export SVG</button>
            <button className="small" disabled={!saved.length} onClick={exportJson}>Export library</button>
            <label className="small" style={{ color: 'var(--accent2)', cursor: 'pointer' }}>
              Import library
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
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
      </div>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} width={900} height={900} style={{ width: 'min(90vh, 90%)', height: 'min(90vh, 90%)' }} />
      </div>
    </div>
  )
}
