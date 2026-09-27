import type { ReactNode } from 'react'
import { useStore } from '../../state/store'
import { geomClient } from '../../worker/client'

interface Props {
  region: Uint32Array | null
  /** the tile-or-surface switch, rendered by the Apply screen so both panels show the same one */
  methodPicker?: ReactNode
}

function Num({ id, label, value, onChange, step = 1, min, max, title }: { id: string; label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; title?: string }) {
  return (
    <div className="row" title={title}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" value={value} step={step} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

/**
 * Voronoi generated over the selected surface: seeds are scattered and relaxed
 * on the mesh itself and the cells are built in 3D, so there is no flattening,
 * no tile placement and no preview. The controls mirror the tile panel's
 * grouping so switching methods feels like the same section.
 */
export default function VoronoiPanel({ region, methodPicker }: Props) {
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
    if (!body || !region?.length || s.busy) return
    s.setBusy('voronoi: starting')
    try {
      const params = { ...s.voronoi }
      const result = await geomClient().voronoi(body.mesh, region, params, (p) => st().setBusy(`voronoi: ${p}`))
      st().replaceMesh(body.id, result.mesh)
      st().pushLog(['Surface Voronoi applied', ...result.log])
    } catch (e) {
      if ((e as Error).message !== 'cancelled') st().pushLog(`voronoi failed: ${(e as Error).message}`)
    } finally {
      st().setBusy(null)
    }
  }

  const defaults = useStore.getInitialState()
  const advancedChanges = [
    lineWidth !== defaults.lineWidth && `Line width ${lineWidth} mm`,
    v.minIslandVolume !== defaults.voronoi.minIslandVolume && `Island cutoff ${v.minIslandVolume} mm³`,
  ].filter(Boolean)
  const status = !activeBodyId ? 'Load a model and choose a surface.'
    : !region?.length ? 'Choose a surface to generate cells on.'
    : 'Cells are generated over the selected surface when you apply. This method has no preview; undo the body to try other settings.'

  return (
    <div className="section placement-panel">
      <h3>Pattern placement</h3>
      <div className="muted" style={{ marginBottom: 8 }}>Voronoi cells · generated on the surface</div>
      {methodPicker}
      <div className="row wrap placement-actions">
        <button className="primary" disabled={!activeBodyId || !region?.length || !!busy} onClick={run}>Apply</button>
        {busy && <button onClick={() => { geomClient().restart(); st().setBusy(null); st().pushLog('cancelled') }}>Cancel</button>}
        <span className="muted">{region?.length ? `${region.length.toLocaleString()} △` : ''}</span>
      </div>
      <div className="muted placement-status" role="status">{status}</div>
      <fieldset className="placement-controls" disabled={!!busy}>
        <div className="placement-group">
          <h4>Cells</h4>
          <Num id="voronoi-cell-size" label="Cell size (mm)" value={v.cellSize} min={1} step={0.5} onChange={(x) => set({ cellSize: x })} title="mean spacing between cell centres" />
          <Num id="voronoi-rib-width" label="Rib width (mm)" value={v.ribWidth} min={0.4} step={0.1} onChange={(x) => set({ ribWidth: x })} title="ribs are never thinner than two printer lines" />
          <Num id="voronoi-relax" label="Relax passes" value={v.relaxPasses} min={0} max={10} onChange={(x) => set({ relaxPasses: Math.round(x) })} title="evens out cell sizes" />
          <Num id="voronoi-seed" label="Seed" value={v.seed} min={0} onChange={(x) => set({ seed: Math.round(x) })} />
          <Num id="voronoi-margin" label="Solid edge margin (mm)" value={v.edgeMargin} min={0} step={0.5} onChange={(x) => set({ edgeMargin: x })} title="band along the region boundary that stays untouched" />
        </div>
        <div className="placement-group">
          <h4>Operation</h4>
          <div className="row">
            <label htmlFor="voronoi-operation">Operation</label>
            <select id="voronoi-operation" value={v.mode} onChange={(e) => set({ mode: e.target.value as typeof v.mode })}>
              <option value="cut">Through-cut</option><option value="recess">Recess</option><option value="emboss">Emboss</option>
            </select>
          </div>
          <div className="row">
            <label htmlFor="voronoi-feature">Shape</label>
            <select id="voronoi-feature" value={v.feature} onChange={(e) => set({ feature: e.target.value as typeof v.feature })}>
              <option value="cells">Cells (ribs remain)</option><option value="ribs">Ribs (cells remain)</option>
            </select>
          </div>
          <Num
            id="voronoi-depth"
            label={v.mode === 'cut' ? 'Wall thickness (mm)' : v.mode === 'recess' ? 'Depth (mm)' : 'Height (mm)'}
            value={v.depth} min={0.1} step={0.1} onChange={(x) => set({ depth: x })}
            title={v.mode === 'cut' ? 'how deep the cut must reach to go through' : undefined}
          />
        </div>
        <details className="placement-advanced">
          <summary>Advanced <span className="muted">{advancedChanges.length ? `· ${advancedChanges.length} changed` : '· defaults'}</span></summary>
          <Num id="voronoi-line-width" label="Line width (mm)" value={lineWidth} min={0.1} step={0.02} onChange={setLineWidth} title="nozzle line width; ribs are never thinner than two lines" />
          <Num id="voronoi-islands" label="Drop islands under (mm³)" value={v.minIslandVolume} min={0} step={1} onChange={(x) => set({ minIslandVolume: x })} />
        </details>
        {advancedChanges.length > 0 && <div className="muted placement-summary">{advancedChanges.join(' · ')}</div>}
      </fieldset>
    </div>
  )
}
