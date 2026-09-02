// Singleton loader for the manifold-3d WASM module.
// Everything geometric goes through here so the module is initialised exactly once
// per thread (main thread or worker).

import Module from 'manifold-3d'
import type { ManifoldToplevel, Manifold, Mesh } from 'manifold-3d'

let toplevel: ManifoldToplevel | null = null
let pending: Promise<ManifoldToplevel> | null = null

export async function getManifold(): Promise<ManifoldToplevel> {
  if (toplevel) return toplevel
  if (!pending) {
    pending = Module().then((m) => {
      m.setup()
      toplevel = m
      return m
    })
  }
  return pending
}

export type { Manifold, Mesh, ManifoldToplevel }

/** Plain transferable triangle soup: positions (xyz interleaved) and indices. */
export interface TriMesh {
  positions: Float32Array
  indices: Uint32Array
}

/** Build a Manifold from a triangle mesh. Throws if the mesh is not manifold. */
export function manifoldFromTriMesh(m: ManifoldToplevel, tri: TriMesh): Manifold {
  const mesh = new m.Mesh({
    numProp: 3,
    vertProperties: tri.positions,
    triVerts: tri.indices,
  })
  mesh.merge() // merges coincident vertices so STL soup can become manifold
  const man = new m.Manifold(mesh)
  const status = man.status()
  if (status !== 'NoError') {
    throw new Error(`Mesh is not manifold: ${status}`)
  }
  return man
}

/** Extract a triangle mesh from a Manifold. */
export function triMeshFromManifold(man: Manifold): TriMesh {
  const mesh = man.getMesh()
  // vertProperties may carry extra properties; copy out xyz only.
  const n = mesh.numVert
  const positions = new Float32Array(n * 3)
  const np = mesh.numProp
  for (let i = 0; i < n; i++) {
    positions[i * 3] = mesh.vertProperties[i * np]
    positions[i * 3 + 1] = mesh.vertProperties[i * np + 1]
    positions[i * 3 + 2] = mesh.vertProperties[i * np + 2]
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) }
}
