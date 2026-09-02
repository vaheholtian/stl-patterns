import { parseStl } from './stl'
import { parse3mf } from './threemf'
import { extractSubMesh } from '../geom/submesh'
import type { TriMesh } from '../geom/manifold'

export interface LoadedBody {
  name: string
  mesh: TriMesh
  info: string
}

/** Load an STL or 3MF file into welded, millimetre triangle meshes. */
export async function loadMeshFile(file: File): Promise<LoadedBody[]> {
  const buf = await file.arrayBuffer()
  const lower = file.name.toLowerCase()
  const base = file.name.replace(/\.[^.]+$/, '')
  const weld = (m: TriMesh): TriMesh => {
    const sub = extractSubMesh(m, null)
    return { positions: sub.positions, indices: sub.indices }
  }
  if (lower.endsWith('.stl')) {
    const raw = parseStl(buf)
    const mesh = weld(raw)
    return [{ name: base, mesh, info: `STL, ${mesh.indices.length / 3} triangles (units assumed mm)` }]
  }
  if (lower.endsWith('.3mf')) {
    const f = parse3mf(buf)
    return f.bodies.map((b, i) => {
      const mesh = weld(b.mesh)
      return { name: b.name || `${base} ${i + 1}`, mesh, info: `3MF (${f.unit}), ${mesh.indices.length / 3} triangles` }
    })
  }
  throw new Error('Unsupported file type. Use .stl or .3mf')
}
