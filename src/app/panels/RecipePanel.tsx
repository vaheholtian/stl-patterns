import { useState } from 'react'
import { useStore } from '../../state/store'
import { useTileStore } from '../../state/tileStore'
import { useRecipes, type Recipe } from '../../state/recipes'
import { downloadBlob } from '../../io/download'
import { triangleAreaNormal } from '../../geom/sampling'

/** Find the triangle whose centroid is nearest to a point with a compatible normal. */
function findTriangle(positions: Float32Array, indices: Uint32Array, point: [number, number, number], normal: [number, number, number]): number {
  let best = -1, bestD = Infinity
  const tmp = new Float64Array(3)
  const tri = { positions, indices }
  for (let t = 0; t < indices.length / 3; t++) {
    let cx = 0, cy = 0, cz = 0
    for (let c = 0; c < 3; c++) { const v = indices[t * 3 + c] * 3; cx += positions[v]; cy += positions[v + 1]; cz += positions[v + 2] }
    cx /= 3; cy /= 3; cz /= 3
    const d = (cx - point[0]) ** 2 + (cy - point[1]) ** 2 + (cz - point[2]) ** 2
    if (d >= bestD) continue
    triangleAreaNormal(tri, t, tmp)
    if (tmp[0] * normal[0] + tmp[1] * normal[1] + tmp[2] * normal[2] < 0.5) continue
    bestD = d; best = t
  }
  return best
}

export default function RecipePanel() {
  const recipes = useRecipes((s) => s.recipes)
  const bodies = useStore((s) => s.bodies)
  const activeBodyId = useStore((s) => s.activeBodyId)
  const selection = useStore((s) => s.selection)
  const st = useStore.getState
  const [name, setName] = useState('')

  const save = (op: 'tile' | 'voronoi') => {
    const s = st()
    const body = s.bodies.find((b) => b.id === s.activeBodyId)
    if (!body) return
    let point: [number, number, number] | null = null, normal: [number, number, number] | null = null
    if (s.selection) {
      // representative triangle: the first selected one nearest the layout origin if any, else the first
      let t = -1
      for (let i = 0; i < s.selection.length; i++) if (s.selection[i]) { t = i; break }
      if (t >= 0) {
        const p = body.mesh.positions, ix = body.mesh.indices
        let cx = 0, cy = 0, cz = 0
        for (let c = 0; c < 3; c++) { const v = ix[t * 3 + c] * 3; cx += p[v]; cy += p[v + 1]; cz += p[v + 2] }
        const tmp = new Float64Array(3)
        triangleAreaNormal(body.mesh, t, tmp)
        point = [cx / 3, cy / 3, cz / 3]; normal = [tmp[0], tmp[1], tmp[2]]
      }
    }
    useRecipes.getState().add({
      name: name || `${op} on ${body.name}`,
      op,
      region: { wholeBody: !s.selection, point, normal, segmentAngle: s.segmentAngle },
      tile: op === 'tile' ? useTileStore.getState().def : undefined,
      layout: op === 'tile' ? s.tileLayout : undefined,
      voronoi: op === 'voronoi' ? s.voronoi : undefined,
    })
    setName('')
  }

  const load = (r: Recipe) => {
    const s = st()
    const body = s.bodies.find((b) => b.id === s.activeBodyId)
    if (!body) { s.pushLog('load a body first, then load the recipe'); return }
    s.setSegmentAngle(r.region.segmentAngle)
    if (r.region.wholeBody || !r.region.point || !r.region.normal) {
      s.setSelection(null)
    } else {
      const t = findTriangle(body.mesh.positions, body.mesh.indices, r.region.point, r.region.normal)
      if (t < 0) { s.pushLog('recipe: could not find the region on this body'); s.setSelection(null) }
      else {
        const adj = s.adjacencyFor(body.id)!
        const mask = new Uint8Array(adj.nTri)
        for (const x of adj.floodFill(t, r.region.segmentAngle)) mask[x] = 1
        s.setSelection(mask)
      }
    }
    if (r.tile) useTileStore.getState().setDef(r.tile)
    if (r.layout) s.setTileLayout(r.layout)
    if (r.voronoi) s.setVoronoi(r.voronoi)
    s.pushLog(`recipe "${r.name}" loaded: region selected and settings restored. Flatten and apply when ready.`)
  }

  const exportAll = () => downloadBlob(new Blob([JSON.stringify(recipes, null, 1)], { type: 'application/json' }), 'stl-patterns-recipes.json')
  const importFile = async (f: File) => {
    try { const list = JSON.parse(await f.text()); if (Array.isArray(list)) useRecipes.getState().importList(list) } catch (e) { st().pushLog(`could not read recipes: ${(e as Error).message}`) }
  }

  return (
    <div className="section">
      <h3>Recipes</h3>
      <div className="muted" style={{ marginBottom: 6 }}>Save the current region and settings to redo them on a re-exported part.</div>
      <div className="row">
        <input type="text" placeholder="recipe name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="row wrap">
        <button className="small" disabled={!activeBodyId} onClick={() => save('tile')}>Save tile setup</button>
        <button className="small" disabled={!activeBodyId} onClick={() => save('voronoi')}>Save Voronoi setup</button>
        <button className="small" disabled={!recipes.length} onClick={exportAll}>Export</button>
        <label className="small" style={{ color: 'var(--accent2)', cursor: 'pointer' }}>
          Import
          <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
      </div>
      <div className="bodies">
        {recipes.map((r) => (
          <div key={r.id} className="body-row" onClick={() => load(r)} title={selection ? 'replaces the current selection' : ''}>
            <span className="name">{r.name}</span>
            <span className="muted">{r.op}</span>
            <button className="small" onClick={(e) => { e.stopPropagation(); useRecipes.getState().remove(r.id) }}>✕</button>
          </div>
        ))}
        {!recipes.length && <div className="muted">{bodies.length ? 'No recipes yet.' : ''}</div>}
      </div>
    </div>
  )
}
