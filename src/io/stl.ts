import type { TriMesh } from '../geom/manifold'

/** Binary STL from a triangle mesh (millimetres, as-is). */
export function writeBinaryStl(tri: TriMesh, name = 'stl-patterns'): ArrayBuffer {
  const nTri = tri.indices.length / 3
  const buf = new ArrayBuffer(84 + nTri * 50)
  const dv = new DataView(buf)
  const header = new Uint8Array(buf, 0, 80)
  const enc = new TextEncoder().encode(name.slice(0, 79))
  header.set(enc)
  dv.setUint32(80, nTri, true)
  const p = tri.positions, ix = tri.indices
  let off = 84
  for (let t = 0; t < nTri; t++) {
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true)
    dv.setFloat32(off + 12, p[a], true); dv.setFloat32(off + 16, p[a + 1], true); dv.setFloat32(off + 20, p[a + 2], true)
    dv.setFloat32(off + 24, p[b], true); dv.setFloat32(off + 28, p[b + 1], true); dv.setFloat32(off + 32, p[b + 2], true)
    dv.setFloat32(off + 36, p[c], true); dv.setFloat32(off + 40, p[c + 1], true); dv.setFloat32(off + 44, p[c + 2], true)
    dv.setUint16(off + 48, 0, true)
    off += 50
  }
  return buf
}

/** Parse binary or ASCII STL into a triangle soup (no vertex merging). */
export function parseStl(buf: ArrayBuffer): TriMesh {
  const bytes = new Uint8Array(buf)
  const isAscii = (() => {
    if (buf.byteLength < 84) return true
    const nTri = new DataView(buf).getUint32(80, true)
    if (84 + nTri * 50 === buf.byteLength) return false
    const head = new TextDecoder().decode(bytes.subarray(0, 5))
    return head.toLowerCase() === 'solid'
  })()
  if (!isAscii) {
    const dv = new DataView(buf)
    const nTri = dv.getUint32(80, true)
    const positions = new Float32Array(nTri * 9)
    const indices = new Uint32Array(nTri * 3)
    let off = 84
    for (let t = 0; t < nTri; t++) {
      off += 12 // normal
      for (let v = 0; v < 3; v++) {
        positions[t * 9 + v * 3] = dv.getFloat32(off, true)
        positions[t * 9 + v * 3 + 1] = dv.getFloat32(off + 4, true)
        positions[t * 9 + v * 3 + 2] = dv.getFloat32(off + 8, true)
        off += 12
        indices[t * 3 + v] = t * 3 + v
      }
      off += 2
    }
    return { positions, indices }
  }
  const text = new TextDecoder().decode(bytes)
  const verts: number[] = []
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g
  let mt: RegExpExecArray | null
  while ((mt = re.exec(text))) verts.push(+mt[1], +mt[2], +mt[3])
  const positions = new Float32Array(verts)
  const indices = new Uint32Array(positions.length / 3)
  for (let i = 0; i < indices.length; i++) indices[i] = i
  return { positions, indices }
}
