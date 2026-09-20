/**
 * A dependency-free triangle rasteriser, so a cut body can be looked at without a
 * browser or a GPU. Flat shading is not a compromise here: every face of a cut box
 * is planar, so a per-face normal is the exact normal.
 *
 * What makes a cut legible rather than a grey blob:
 *  - true outward normals, no two-sided flip. A watertight solid only ever shows a
 *    camera-facing outward normal, so the inside wall of a recess is lit by its own
 *    orientation and reads as an inside wall.
 *  - a depth-difference term (the cheap screen-space occlusion below), which is what
 *    actually draws the eye to where material was removed.
 *  - a floor with a projected shadow, so the box sits somewhere instead of floating.
 */
import type { TriMesh } from '../../src/geom/manifold.ts'

export type V3 = [number, number, number]
export interface Part { mesh: TriMesh; rgb: V3 }
export interface Cam { eye: V3; target: V3; up?: V3; fovDeg?: number }
export interface RenderOpts {
  width: number
  height: number
  /** supersampling factor; the buffer is rendered this much larger and boxed down */
  ss?: number
  cam: Cam
  /** floor plane height, or null for no floor and no shadow */
  floorZ?: number | null
  background?: [V3, V3]
  floorRgb?: V3
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** key, fill and rim, in world space. Diffuse weights plus ambient come to 1. */
const LIGHTS: { dir: V3; w: number }[] = [
  { dir: norm([-0.45, -0.75, 0.62]), w: 0.62 },
  { dir: norm([0.85, -0.2, 0.25]), w: 0.2 },
  { dir: norm([0.1, 0.8, 0.35]), w: 0.1 },
]
const AMBIENT = 0.24
/** the sun that casts the floor shadow, pointing down */
const SUN: V3 = norm([0.45, 0.75, -1.15])

export function render(parts: Part[], o: RenderOpts): { rgb: Uint8Array; width: number; height: number } {
  const ss = o.ss ?? 3
  const W = Math.round(o.width * ss), H = Math.round(o.height * ss)
  const { eye, target } = o.cam, up: V3 = o.cam.up ?? [0, 0, 1]
  const f = norm(sub(target, eye)), r = norm(cross(f, up)), u = cross(r, f)
  const k = (H / 2) / Math.tan(((o.cam.fovDeg ?? 30) * Math.PI / 180) / 2)

  /** world -> (screen x, screen y, view depth) */
  const project = (p: V3): V3 => {
    const d = sub(p, eye), vz = dot(d, f)
    return [W / 2 + (dot(d, r) / vz) * k, H / 2 - (dot(d, u) / vz) * k, vz]
  }

  const depth = new Float32Array(W * H)       // 1/vz, 0 = nothing here
  const shade = new Float32Array(W * H * 3)
  const shadow = new Float32Array(W * H)

  /** one triangle; with `mask` it only marks coverage, otherwise it z-tests and paints */
  const tri = (pa: V3, pb: V3, pc: V3, paint: ((i: number) => void) | null, mask: Float32Array | null) => {
    const [ax, ay, az] = pa, [bx, by, bz] = pb, [cx, cy, cz] = pc
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)))
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)))
    if (minX > maxX || minY > maxY) return
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (Math.abs(area) < 1e-12) return
    const ia = 1 / area
    // inverse view depth interpolates linearly in screen space; view depth does not
    const wa = 1 / az, wb = 1 / bz, wc = 1 / cz
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5
        const l0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * ia   // weight of c
        const l1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * ia   // weight of a
        if (l0 < 0 || l1 < 0 || l0 + l1 > 1) continue
        const i = y * W + x
        if (mask) { mask[i] = 1; continue }
        const w = wa * l1 + wb * (1 - l0 - l1) + wc * l0
        if (w <= depth[i]) continue
        depth[i] = w
        paint!(i)
      }
    }
  }

  // --- the solid --------------------------------------------------------------
  const a: V3 = [0, 0, 0], b: V3 = [0, 0, 0], c: V3 = [0, 0, 0]
  for (const part of parts) {
    const { positions, indices } = part.mesh
    const rgb = part.rgb
    for (let t = 0; t < indices.length; t += 3) {
      for (let d = 0; d < 3; d++) {
        a[d] = positions[indices[t] * 3 + d]
        b[d] = positions[indices[t + 1] * 3 + d]
        c[d] = positions[indices[t + 2] * 3 + d]
      }
      const n = norm(cross(sub(b, a), sub(c, a)))
      const mid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
      // a watertight solid only ever shows an outward normal that faces the camera
      if (dot(n, sub(eye, mid)) <= 0) continue
      let lit = AMBIENT
      for (const L of LIGHTS) lit += L.w * Math.max(0, dot(n, L.dir))
      const pa = project(a), pb = project(b), pc = project(c)
      if (pa[2] <= 0 || pb[2] <= 0 || pc[2] <= 0) continue
      const R = rgb[0] * lit, G = rgb[1] * lit, B = rgb[2] * lit
      tri(pa, pb, pc, (i) => { shade[i * 3] = R; shade[i * 3 + 1] = G; shade[i * 3 + 2] = B }, null)
    }
  }

  // --- the shadow: the same triangles flattened onto the floor along the sun ----
  const floorZ = o.floorZ ?? null
  if (floorZ !== null) {
    const flat = (p: V3): V3 => { const t = (p[2] - floorZ) / SUN[2]; return [p[0] - SUN[0] * t, p[1] - SUN[1] * t, floorZ] }
    for (const part of parts) {
      const { positions, indices } = part.mesh
      for (let t = 0; t < indices.length; t += 3) {
        for (let d = 0; d < 3; d++) {
          a[d] = positions[indices[t] * 3 + d]
          b[d] = positions[indices[t + 1] * 3 + d]
          c[d] = positions[indices[t + 2] * 3 + d]
        }
        const pa = project(flat(a)), pb = project(flat(b)), pc = project(flat(c))
        if (pa[2] <= 0 || pb[2] <= 0 || pc[2] <= 0) continue
        tri(pa, pb, pc, null, shadow)
      }
    }
    blur(shadow, W, H, Math.max(1, Math.round(2.5 * ss)))
  }

  // --- screen-space occlusion: how much nearer the neighbourhood is -------------
  const ao = new Float32Array(W * H).fill(1)
  const radius = Math.max(1, Math.round(2.2 * ss))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    if (!depth[i]) continue
    const z = 1 / depth[i]
    let occ = 0, n = 0
    for (let dy = -radius; dy <= radius; dy += radius) for (let dx = -radius; dx <= radius; dx += radius) {
      if (!dx && !dy) continue
      const X = x + dx, Y = y + dy
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue
      n++
      const j = Y * W + X
      if (!depth[j]) continue
      const dz = z - 1 / depth[j]          // neighbour nearer => positive
      if (dz > 0.15) occ += Math.min(1, dz / 6)
    }
    ao[i] = 1 - 0.55 * (n ? occ / n : 0)
  }
  blur(ao, W, H, Math.max(1, Math.round(1.2 * ss)))

  // --- composite ---------------------------------------------------------------
  const bg = o.background ?? [[0.965, 0.960, 0.950] as V3, [0.902, 0.898, 0.888] as V3]
  const floorRgb = o.floorRgb ?? [0.806, 0.800, 0.788]
  const out = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1)
    const gr: V3 = [bg[0][0] + (bg[1][0] - bg[0][0]) * t, bg[0][1] + (bg[1][1] - bg[0][1]) * t, bg[0][2] + (bg[1][2] - bg[0][2]) * t]
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      let R: number, G: number, B: number
      if (depth[i]) {
        const s = ao[i]
        R = shade[i * 3] * s; G = shade[i * 3 + 1] * s; B = shade[i * 3 + 2] * s
      } else {
        // where does this pixel's ray meet the floor? the plane is real, so the
        // horizon lands where the camera actually puts it
        let onFloor = 0, fade = 1
        if (floorZ !== null) {
          const sx = (x + 0.5 - W / 2) / k, sy = -(y + 0.5 - H / 2) / k
          const dz = f[2] + sx * r[2] + sy * u[2]
          if (dz < -1e-9) {
            const tt = (floorZ - eye[2]) / dz
            if (tt > 0) {
              const px = eye[0] + tt * (f[0] + sx * r[0] + sy * u[0])
              const py = eye[1] + tt * (f[1] + sx * r[1] + sy * u[1])
              onFloor = 1
              // the floor fades out with distance from the body, so the frame has no hard edge
              const d = Math.hypot(px - target[0], py - target[1])
              fade = Math.min(1, Math.max(0, (330 - d) / 130))
            }
          }
        }
        onFloor *= fade
        const sh = floorZ === null ? 0 : Math.min(1, shadow[i]) * 0.4 * onFloor
        const fR = gr[0] * (1 - onFloor) + floorRgb[0] * onFloor
        const fG = gr[1] * (1 - onFloor) + floorRgb[1] * onFloor
        const fB = gr[2] * (1 - onFloor) + floorRgb[2] * onFloor
        R = fR * (1 - sh); G = fG * (1 - sh); B = fB * (1 - sh)
      }
      out[i * 3] = gamma(R); out[i * 3 + 1] = gamma(G); out[i * 3 + 2] = gamma(B)
    }
  }

  // --- box down -----------------------------------------------------------------
  if (ss === 1) return { rgb: out, width: W, height: H }
  const w = o.width, h = o.height, small = new Uint8Array(w * h * 3), n = ss * ss
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let R = 0, G = 0, B = 0
    for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) {
      const j = ((y * ss + dy) * W + x * ss + dx) * 3
      R += out[j]; G += out[j + 1]; B += out[j + 2]
    }
    const i = (y * w + x) * 3
    small[i] = R / n; small[i + 1] = G / n; small[i + 2] = B / n
  }
  return { rgb: small, width: w, height: h }
}

function gamma(v: number) {
  return Math.max(0, Math.min(255, Math.round(255 * Math.pow(Math.max(0, v), 1 / 2.2))))
}

/** separable box blur, run twice, which is close enough to a gaussian here */
function blur(buf: Float32Array, W: number, H: number, r: number) {
  if (r < 1) return
  const tmp = new Float32Array(buf.length)
  const cl = (v: number, hi: number) => v < 0 ? 0 : v > hi ? hi : v
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) {
      let sum = 0
      for (let x = -r; x <= r; x++) sum += buf[y * W + cl(x, W - 1)]
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = sum / (2 * r + 1)
        sum -= buf[y * W + cl(x - r, W - 1)]
        sum += buf[y * W + cl(x + r + 1, W - 1)]
      }
    }
    for (let x = 0; x < W; x++) {
      let sum = 0
      for (let y = -r; y <= r; y++) sum += tmp[cl(y, H - 1) * W + x]
      for (let y = 0; y < H; y++) {
        buf[y * W + x] = sum / (2 * r + 1)
        sum -= tmp[cl(y - r, H - 1) * W + x]
        sum += tmp[cl(y + r + 1, H - 1) * W + x]
      }
    }
  }
}
