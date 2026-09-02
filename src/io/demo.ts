// Built-in demo bodies for testing without a file (dev: ?load=demo:<name>).
import { getManifold, triMeshFromManifold, type TriMesh } from '../geom/manifold'

export async function buildDemo(name: string): Promise<{ name: string; mesh: TriMesh }> {
  const m = await getManifold()
  const M = m.Manifold
  let body
  if (name === 'sphere') {
    body = M.difference(M.sphere(30, 96), M.sphere(28, 96))
  } else if (name === 'sphere-prism') {
    // a sphere merging into a box, shelled to a 2 mm wall, open at the bottom
    const outer = M.union(M.sphere(30, 96).translate([0, 0, 40]), M.cube([50, 50, 40], false).translate([-25, -25, 0]))
    const inner = M.union(M.sphere(28, 96).translate([0, 0, 40]), M.cube([46, 46, 40], false).translate([-23, -23, -2]))
    body = M.difference(outer, inner)
  } else if (name === 'box') {
    body = M.difference(M.cube([60, 40, 30], false), M.cube([56, 36, 30], false).translate([2, 2, 2]))
  } else {
    throw new Error(`unknown demo ${name}`)
  }
  const mesh = triMeshFromManifold(body)
  body.delete()
  return { name: `demo ${name}`, mesh }
}
