import { useEffect, useMemo, useRef, useState } from 'react'
import type { LayerSeams, SeamReport } from '../gcode/seams'
import type { PlateOutcome, SeamReply } from '../worker/seams.worker'
import { downloadBlob } from '../io/download'

interface View { cx: number; cy: number; scale: number }   // mm at the canvas centre, px per mm
interface Done { name: string; bytes: Uint8Array; plates: PlateOutcome[]; source: string }

const INSIDE = '#5fd38d'
const OUTSIDE = '#ff6b6b'
const SIDE = '#f2a33a'
const LOOP = '#c9956680'

export default function SeamScreen() {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [plateIdx, setPlateIdx] = useState(0)
  const [layerIdx, setLayerIdx] = useState(0)
  const [view, setView] = useState<View | null>(null)

  const run = (file: File) => {
    setBusy(`Reading ${file.name}…`); setError(null); setDone(null)
    file.arrayBuffer().then((buf) => {
      setBusy(`Moving seams in ${file.name}…`)
      const worker = new Worker(new URL('../worker/seams.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (ev: MessageEvent<SeamReply>) => {
        worker.terminate(); setBusy(null)
        const r = ev.data
        if (!r.ok) { setError(r.error); return }
        setDone({ name: r.name, bytes: r.bytes, plates: r.plates, source: file.name })
        setPlateIdx(0); setView(null)
        const layers = r.plates[0]?.before.layers ?? []
        setLayerIdx(Math.floor(layers.length / 2))
      }
      worker.onerror = (e) => { worker.terminate(); setBusy(null); setError(e.message || 'The seam worker failed.') }
      worker.postMessage({ name: file.name, buf }, [buf])
    })
  }

  const plate = done?.plates[plateIdx]
  const layers = plate?.before.layers ?? []
  const layer = layers[Math.min(layerIdx, layers.length - 1)]
  const afterLayer = useMemo(() => plate?.after.layers.find((l) => l.layer === layer?.layer), [plate, layer])
  const fit = useMemo(() => (plate ? fitView(plate.before) : null), [plate])
  const v = view ?? fit

  return (
    <div className="apply">
      <div className="sidebar">
        <div
          className={'dropzone' + (over ? ' over' : '')}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) run(f) }}
        >
          Drop a sliced .gcode.3mf or .gcode here, or{' '}
          <label style={{ color: 'var(--accent2)', cursor: 'pointer' }}>
            browse
            <input type="file" accept=".3mf,.gcode" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = '' }} />
          </label>
        </div>

        <div className="section">
          <h3>Seams inside</h3>
          <div className="muted seam-note">
            A pattern cut through a wall prints every slat as its own little loop, each with a seam. The slicer's
            “back” seam puts half of them on the outside of the part. This moves each loop's seam to the middle of
            its inner face and redoes the travel and wipe around it.
          </div>
          {busy && <div className="seam-status">{busy}</div>}
          {error && <div className="seam-status danger">{error}</div>}
        </div>

        {done && plate && (
          <div className="section">
            <h3>Result</h3>
            {done.plates.length > 1 && (
              <div className="row">
                <label>Plate</label>
                <select value={plateIdx} onChange={(e) => { setPlateIdx(+e.target.value); setView(null) }}>
                  {done.plates.map((p, i) => <option key={p.path} value={i}>{p.path.replace(/^Metadata\//, '')}</option>)}
                </select>
              </div>
            )}
            <table className="seam-table">
              <thead><tr><th /><th>Before</th><th>After</th></tr></thead>
              <tbody>
                <tr><td><span className="seam-dot" style={{ background: INSIDE }} />Inner face</td><td>{n(plate.before.inside)}</td><td>{n(plate.after.inside)}</td></tr>
                <tr><td><span className="seam-dot" style={{ background: SIDE }} />Side</td><td>{n(plate.before.side)}</td><td>{n(plate.after.side)}</td></tr>
                <tr><td><span className="seam-dot" style={{ background: OUTSIDE }} />Outer face</td><td>{n(plate.before.outside)}</td><td>{n(plate.after.outside)}</td></tr>
              </tbody>
            </table>
            <div className="muted seam-note">
              {n(plate.moved)} loops moved{plate.alreadyInside ? `, ${n(plate.alreadyInside)} were already there` : ''}.
              {' '}{n(plate.before.untouched)} walls go round the whole part or are single lines, and keep their seam.
              {Object.keys(plate.skipped).length > 0 && <> Left as sliced: {Object.entries(plate.skipped).map(([k, c]) => `${c} (${k})`).join(', ')}.</>}
            </div>
            <button className="primary" style={{ width: '100%' }} onClick={() => downloadBlob(new Blob([done.bytes as BlobPart]), done.name)}>
              Download {done.name}
            </button>
            <div className="muted seam-note">Re-slicing in Bambu Studio undoes this; run the new slice through here again.</div>
          </div>
        )}
      </div>

      <div className="seam-view">
        {!done && <div className="seam-empty muted">{busy ?? 'Top view of each layer, before and after, shows up here.'}</div>}
        {done && layer && v && (
          <>
            <div className="seam-panes">
              <SeamCanvas title="Before" layer={layer} view={v} onView={setView} />
              <SeamCanvas title="After" layer={afterLayer} view={v} onView={setView} />
            </div>
            <div className="seam-controls">
              <span className="muted">Layer {layer.layer} · Z {layer.z.toFixed(2)} mm</span>
              <input type="range" min={0} max={layers.length - 1} value={Math.min(layerIdx, layers.length - 1)} onChange={(e) => setLayerIdx(+e.target.value)} />
              <button className="small" onClick={() => setView(null)}>Fit</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const n = (x: number) => x.toLocaleString()

function fitView(r: SeamReport): View | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const l of r.layers) for (const lp of l.loops) for (let i = 0; i < lp.length; i += 2) {
    x0 = Math.min(x0, lp[i]); x1 = Math.max(x1, lp[i]); y0 = Math.min(y0, lp[i + 1]); y1 = Math.max(y1, lp[i + 1])
  }
  if (!isFinite(x0)) return null
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale: -Math.max(x1 - x0, y1 - y0, 1) }   // negative: fit on first draw
}

function SeamCanvas({ title, layer, view, onView }: { title: string; layer?: LayerSeams; view: View; onView: (v: View) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; v: View } | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current!.parentElement!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // a fitted view carries the extent as a negative scale; resolve it against this pane's size
  const scale = view.scale < 0 ? 0.9 * Math.min(size.w, size.h) / -view.scale : view.scale
  const toScreen = (x: number, y: number): [number, number] => [size.w / 2 + (x - view.cx) * scale, size.h / 2 - (y - view.cy) * scale]

  useEffect(() => {
    const cv = ref.current!
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.max(1, size.w * dpr); cv.height = Math.max(1, size.h * dpr)
    const g = cv.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = '#101216'; g.fillRect(0, 0, size.w, size.h)
    if (!layer) return
    g.strokeStyle = LOOP; g.lineWidth = Math.max(0.75, Math.min(2, 0.42 * scale * 0.4))
    for (const lp of layer.loops) {
      g.beginPath()
      for (let i = 0; i < lp.length; i += 2) {
        const [sx, sy] = toScreen(lp[i], lp[i + 1])
        if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy)
      }
      g.stroke()
    }
    const r = Math.max(2, Math.min(5, 0.35 * scale))
    for (const s of layer.seams) {
      const [sx, sy] = toScreen(s.x, s.y)
      g.fillStyle = s.depth < 0.25 ? INSIDE : s.depth > 0.75 ? OUTSIDE : SIDE
      g.beginPath(); g.arc(sx, sy, r, 0, 2 * Math.PI); g.fill()
    }
    const [ccx, ccy] = toScreen(layer.center[0], layer.center[1])
    g.strokeStyle = '#8f97a6'; g.lineWidth = 1
    g.beginPath(); g.moveTo(ccx - 6, ccy); g.lineTo(ccx + 6, ccy); g.moveTo(ccx, ccy - 6); g.lineTo(ccx, ccy + 6); g.stroke()
  })

  const onWheel = (e: React.WheelEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const wx = view.cx + (mx - size.w / 2) / scale, wy = view.cy - (my - size.h / 2) / scale
    const k = Math.exp(-e.deltaY * 0.0015), ns = scale * k
    onView({ cx: wx - (mx - size.w / 2) / ns, cy: wy + (my - size.h / 2) / ns, scale: ns })
  }

  return (
    <div className="seam-pane">
      <div className="seam-pane-title">{title}</div>
      <canvas
        ref={ref}
        style={{ width: size.w, height: size.h }}
        onWheel={onWheel}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, v: { ...view, scale } } }}
        onPointerMove={(e) => {
          const d = drag.current
          if (d) onView({ cx: d.v.cx - (e.clientX - d.x) / d.v.scale, cy: d.v.cy + (e.clientY - d.y) / d.v.scale, scale: d.v.scale })
        }}
        onPointerUp={() => { drag.current = null }}
      />
    </div>
  )
}
