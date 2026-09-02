import { useStore } from '../../state/store'
import { geomClient } from '../../worker/client'

interface Props {
  region: Uint32Array | null
}

function Num({ label, value, onChange, step = 1, min, max, title }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; title?: string }) {
  return (
    <div className="row" title={title}>
      <label>{label}</label>
      <input type="number" value={value} step={step} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

export default function VoronoiPanel({ region }: Props) {
  const v = useStore((s) => s.voronoi)
  const set = useStore((s) => s.setVoronoi)
  const lineWidth = useStore((s) => s.lineWidth)
  const setLineWidth = useStore((s) => s.setLineWidth)
  const busy = useStore((s) => s.busy)
  const activeBodyId = useStore((s) => s.activeBodyId)
  const st = useStore.getState

  const run = async () => {
    const s = st()
    const body = s.bodies.find((b) => b.id === s.activeBodyId)
    if (!body || !region) return
    s.setBusy('voronoi: starting')
    try {
      const params = { ...s.voronoi }
      const result = await geomClient().voronoi(body.mesh, region, params, (p) => st().setBusy(`voronoi: ${p}`))
      st().replaceMesh(body.id, result.mesh)
      st().pushLog(result.log)
    } catch (e) {
      st().pushLog(`voronoi failed: ${(e as Error).message}`)
    } finally {
      st().setBusy(null)
    }
  }

  return (
    <div className="section">
      <h3>Surface Voronoi</h3>
      <Num label="Cell size (mm)" value={v.cellSize} min={1} step={0.5} onChange={(x) => set({ cellSize: x })} title="mean spacing between cell centres" />
      <Num label="Rib width (mm)" value={v.ribWidth} min={0.4} step={0.1} onChange={(x) => set({ ribWidth: x })} />
      <Num label="Relax passes" value={v.relaxPasses} min={0} max={10} onChange={(x) => set({ relaxPasses: Math.round(x) })} title="evens out cell sizes" />
      <Num label="Seed" value={v.seed} min={0} onChange={(x) => set({ seed: Math.round(x) })} />
      <div className="row">
        <label>Mode</label>
        <select value={v.mode} onChange={(e) => set({ mode: e.target.value as typeof v.mode })}>
          <option value="cut">Through-cut</option>
          <option value="recess">Recess</option>
          <option value="emboss">Emboss</option>
        </select>
      </div>
      <div className="row">
        <label>Shape</label>
        <select value={v.feature} onChange={(e) => set({ feature: e.target.value as typeof v.feature })}>
          <option value="cells">Cells (ribs remain)</option>
          <option value="ribs">Ribs (cells remain)</option>
        </select>
      </div>
      <Num label={v.mode === 'cut' ? 'Wall thickness (mm)' : v.mode === 'recess' ? 'Depth (mm)' : 'Height (mm)'} value={v.depth} min={0.1} step={0.1} onChange={(x) => set({ depth: x })} title={v.mode === 'cut' ? 'how deep the cut must reach to go through' : ''} />
      <Num label="Solid edge margin (mm)" value={v.edgeMargin} min={0} step={0.5} onChange={(x) => set({ edgeMargin: x })} title="band along the region boundary that stays untouched" />
      <Num label="Line width (mm)" value={lineWidth} min={0.1} step={0.02} onChange={setLineWidth} title="nozzle line width; ribs are never thinner than two lines" />
      <Num label="Drop islands under (mm³)" value={v.minIslandVolume} min={0} step={1} onChange={(x) => set({ minIslandVolume: x })} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" disabled={!activeBodyId || !region || !!busy} onClick={run}>Apply Voronoi</button>
        {busy && <button onClick={() => { geomClient().restart(); st().setBusy(null); st().pushLog('cancelled') }}>Cancel</button>}
        <span className="muted">{region ? `${region.length.toLocaleString()} △` : ''}</span>
      </div>
    </div>
  )
}
