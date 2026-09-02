import { useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { useStore } from '../../state/store'
import { useTileStore } from '../../state/tileStore'
import { geomClient } from '../../worker/client'
import { getManifold } from '../../geom/manifold'
import type { FlattenedRegion } from '../../geom/regionFlatten'
import { layoutTile, polygonsToSurfaceSegments, type LayoutResult } from '../../geom/layout'
import { getScene } from '../../viewer/sceneRef'
import type { Pt } from '../../patterns/types'

interface Props {
  region: Uint32Array | null
}

/** A point on the region near its centroid, as a default origin. */
function regionCentroid(positions: Float32Array, indices: Uint32Array, region: Uint32Array): [number, number, number] {
  let x = 0, y = 0, z = 0
  for (const t of region) for (let c = 0; c < 3; c++) { const v = indices[t * 3 + c] * 3; x += positions[v]; y += positions[v + 1]; z += positions[v + 2] }
  const n = region.length * 3 || 1
  x /= n; y /= n; z /= n
  // the centroid of a curved region is off the surface; snap to the nearest triangle centroid
  let best: [number, number, number] = [x, y, z], bd = Infinity
  for (const t of region) {
    let cx = 0, cy = 0, cz = 0
    for (let c = 0; c < 3; c++) { const v = indices[t * 3 + c] * 3; cx += positions[v]; cy += positions[v + 1]; cz += positions[v + 2] }
    cx /= 3; cy /= 3; cz /= 3
    const d = (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2
    if (d < bd) { bd = d; best = [cx, cy, cz] }
  }
  return best
}

export default function TilePanel({ region }: Props) {
  const tl = useStore((s) => s.tileLayout)
  const set = useStore((s) => s.setTileLayout)
  const pickMode = useStore((s) => s.pickMode)
  const setPickMode = useStore((s) => s.setPickMode)
  const busy = useStore((s) => s.busy)
  const activeBodyId = useStore((s) => s.activeBodyId)
  const st = useStore.getState
  const tile = useTileStore((s) => s.tile)
  const tilePolys = useTileStore((s) => s.polygons)
  const tileName = useTileStore((s) => s.def.name)
  const [flat, setFlat] = useState<FlattenedRegion | null>(null)
  const [flatKey, setFlatKey] = useState<string>('')
  const [layout, setLayout] = useState<LayoutResult | null>(null)
  const [info, setInfo] = useState<string[]>([])
  const regionKey = region ? `${activeBodyId}:${region.length}:${region[0]}:${region[region.length - 1]}` : ''

  // the flattening is invalid when the region or body changes
  useEffect(() => {
    if (flatKey && flatKey.split('|')[0] !== regionKey) { setFlat(null); setLayout(null); getScene()?.setOverlayLines(null) }
  }, [regionKey, flatKey])

  const flatten = async (originOverride?: [number, number, number]) => {
    const s = st()
    const body = s.bodies.find((b) => b.id === s.activeBodyId)
    if (!body || !region) return
    const origin = originOverride ?? tl.origin ?? regionCentroid(body.mesh.positions, body.mesh.indices, region)
    if (!tl.origin) set({ origin })
    s.setBusy('flattening region')
    try {
      const res = await geomClient().flatten(body.mesh, region, origin, (p) => st().setBusy(p))
      setFlat(res)
      setFlatKey(`${regionKey}|${res.topology}`)
      st().pushLog(res.log)
    } catch (e) {
      st().pushLog(`flatten failed: ${(e as Error).message}`)
    } finally {
      st().setBusy(null)
    }
  }

  // re-layout whenever inputs change
  const layoutTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!flat || !tile || !tl.origin) return
    if (layoutTimer.current) clearTimeout(layoutTimer.current)
    layoutTimer.current = window.setTimeout(async () => {
      try {
        const m = await getManifold()
        const res = layoutTile(m, flat, tilePolys, tile.width, tile.height, {
          origin: tl.origin!,
          rotationDeg: tl.rotationDeg,
          scale: tl.scale,
          margin: tl.margin,
          fitSeam: tl.fitSeam,
          minScale: tl.minScale,
        })
        setLayout(res)
        setInfo(res.log)
        const scene = getScene()
        if (scene) {
          scene.setOverlayLines(polygonsToSurfaceSegments(res.param, res.polygons))
          scene.setMarkers([{ position: new Vector3(...tl.origin!), color: 0x4cff7a }])
        }
      } catch (e) {
        setInfo([`layout failed: ${(e as Error).message}`])
        setLayout(null)
      }
    }, 60)
  }, [flat, tile, tilePolys, tl.origin, tl.rotationDeg, tl.scale, tl.margin, tl.fitSeam, tl.minScale])

  // when the origin is picked on a closed region, the cap must move: re-flatten
  const lastOrigin = useRef<string>('')
  useEffect(() => {
    if (!tl.origin) return
    const k = tl.origin.join(',')
    if (lastOrigin.current && lastOrigin.current !== k && flat?.topology === 'cap') flatten(tl.origin)
    lastOrigin.current = k
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.origin])

  const apply = async () => {
    const s = st()
    const body = s.bodies.find((b) => b.id === s.activeBodyId)
    if (!body || !layout || !flat) return
    s.setBusy('tile: starting')
    try {
      const polygons = layout.polygons.map((p: Pt[]) => { const f = new Float32Array(p.length * 2); p.forEach(([x, y], i) => { f[i * 2] = x; f[i * 2 + 1] = y }); return f })
      const result = await geomClient().tile(body.mesh, {
        polygons,
        mode: tl.mode,
        depth: tl.depth,
        minIslandVolume: tl.minIslandVolume,
        positions: layout.param.sub.positions,
        indices: layout.param.sub.indices,
        normals: layout.param.sub.normals,
        uv: layout.param.uv,
        wallThickness: tl.wallThickness,
        detail: tl.detail,
      }, (p) => st().setBusy(`tile: ${p}`))
      st().replaceMesh(body.id, result.mesh)
      st().pushLog(result.log)
      getScene()?.setOverlayLines(null)
      setFlat(null); setLayout(null)
    } catch (e) {
      st().pushLog(`tile failed: ${(e as Error).message}`)
    } finally {
      st().setBusy(null)
    }
  }

  return (
    <div className="section">
      <h3>Tile from Pattern screen</h3>
      <div className="muted" style={{ marginBottom: 6 }}>
        {tile ? `${tileName}: ${tile.width.toFixed(0)} × ${tile.height.toFixed(0)} mm, ${tilePolys.length} shapes` : 'No tile yet. Make one on the Pattern screen.'}
      </div>
      <div className="row wrap">
        <button className="small" disabled={!region || !!busy || !tile} onClick={() => flatten()}>{flat ? 'Re-flatten' : '1. Flatten region'}</button>
        <button className={'small' + (pickMode === 'origin' ? ' active' : '')} disabled={!flat} onClick={() => setPickMode(pickMode === 'origin' ? 'region' : 'origin')}>
          {pickMode === 'origin' ? 'Click the surface…' : '2. Place origin'}
        </button>
      </div>
      {flat && <div className="muted">{flat.topology === 'seam' ? 'ring-shaped: tile wraps around' : flat.topology === 'cap' ? 'closed: far-side cap left solid' : 'open surface'}</div>}
      <div className="field">
        <label>Rotation {tl.rotationDeg}°</label>
        <input type="range" min={-180} max={180} step={1} value={tl.rotationDeg} onChange={(e) => set({ rotationDeg: Number(e.target.value) })} />
      </div>
      <div className="row"><label>Scale</label><input type="number" step={0.05} min={0.1} value={tl.scale} onChange={(e) => set({ scale: Number(e.target.value) })} /></div>
      <div className="row"><label>Solid edge margin (mm)</label><input type="number" step={0.5} min={0} value={tl.margin} onChange={(e) => set({ margin: Number(e.target.value) })} /></div>
      <div className="row"><label>Fit whole repeats around seam</label><input type="checkbox" checked={tl.fitSeam} onChange={(e) => set({ fitSeam: e.target.checked })} /></div>
      <div className="row" title="on curved surfaces the tile shrinks away from the origin; below this size the surface is left solid"><label>Skip where smaller than</label><input type="number" step={5} min={0} max={95} value={Math.round(tl.minScale * 100)} onChange={(e) => set({ minScale: Number(e.target.value) / 100 })} /></div>
      <div className="row" title="max edge length of the tool mesh, mm; smaller follows tight curves better but makes bigger files"><label>Detail (mm)</label><input type="number" step={0.5} min={0.5} max={5} value={tl.detail} onChange={(e) => set({ detail: Number(e.target.value) })} /></div>
      <div className="row">
        <label>Mode</label>
        <select value={tl.mode} onChange={(e) => set({ mode: e.target.value as typeof tl.mode })}>
          <option value="cut">Through-cut</option>
          <option value="recess">Recess</option>
          <option value="emboss">Emboss</option>
        </select>
      </div>
      {tl.mode === 'cut'
        ? <div className="row"><label>Wall thickness (mm)</label><input type="number" step={0.1} min={0.1} value={tl.wallThickness} onChange={(e) => set({ wallThickness: Number(e.target.value) })} /></div>
        : <div className="row"><label>{tl.mode === 'recess' ? 'Depth (mm)' : 'Height (mm)'}</label><input type="number" step={0.1} min={0.1} value={tl.depth} onChange={(e) => set({ depth: Number(e.target.value) })} /></div>}
      <div className="row"><label>Drop islands under (mm³)</label><input type="number" step={1} min={0} value={tl.minIslandVolume} onChange={(e) => set({ minIslandVolume: Number(e.target.value) })} /></div>
      {info.map((l, i) => <div key={i} className="muted">{l}</div>)}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" disabled={!layout || !!busy} onClick={apply}>3. Apply tile</button>
        {busy && <button onClick={() => { geomClient().restart(); st().setBusy(null); st().pushLog('cancelled') }}>Cancel</button>}
      </div>
    </div>
  )
}
