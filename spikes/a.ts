// Spike A: Voronoi through-cut on a sphere shell. Throwaway. Measures timings.
import { getManifold, triMeshFromManifold, type Manifold } from '../src/geom/manifold'
import { seededRandom } from '../src/geom/random'
import { sampleSurface } from '../src/geom/sampling'
import { SurfaceIndex } from '../src/geom/bvh'
import { relaxOnSurface } from '../src/geom/relax'
import { buildVoronoiCells } from '../src/geom/voronoiCells'
import { writeBinaryStl } from '../src/io/stl'
import { downloadBlob } from '../src/io/download'
import { previewTriMesh } from './preview'

const logEl = document.getElementById('log') as HTMLPreElement
const runBtn = document.getElementById('run') as HTMLButtonElement
const dlBtn = document.getElementById('download') as HTMLButtonElement
const canvas = document.getElementById('view') as HTMLCanvasElement

const lines: string[] = []
function log(s: string) {
  lines.push(s)
  logEl.textContent = lines.join('\n')
  console.log('[spikeA] ' + s)
}

let stlBuffer: ArrayBuffer | null = null

const params = new URLSearchParams(location.search)
const SEEDS = Number(params.get('seeds') ?? 200)
const RIB = Number(params.get('rib') ?? 2)
const K = Number(params.get('k') ?? 12)
const RELAX = Number(params.get('relax') ?? 2)
const OUTER_R = 30
const WALL = 1.6

async function run() {
  lines.length = 0
  runBtn.disabled = true
  dlBtn.disabled = true
  const t0 = performance.now()
  const m = await getManifold()
  log(`manifold ready in ${(performance.now() - t0).toFixed(0)} ms; seeds=${SEEDS} rib=${RIB} k=${K} relax=${RELAX}`)

  const t1 = performance.now()
  const outer = m.Manifold.sphere(OUTER_R, 96)
  const inner = m.Manifold.sphere(OUTER_R - WALL, 96)
  const shell = m.Manifold.difference(outer, inner)
  outer.delete(); inner.delete()
  log(`shell: ${shell.numTri()} tris in ${(performance.now() - t1).toFixed(0)} ms`)

  // Seeds on the outer surface. We sample the outer sphere alone so seeds
  // never land on the inner wall.
  const t2 = performance.now()
  const outerOnly = m.Manifold.sphere(OUTER_R, 96)
  const outerTri = triMeshFromManifold(outerOnly)
  outerOnly.delete()
  const rand = seededRandom(42)
  let seeds = sampleSurface(outerTri, null, SEEDS, rand).points
  const surface = new SurfaceIndex(outerTri)
  for (let i = 0; i < RELAX; i++) seeds = relaxOnSurface(seeds, surface, 8, 0.5)
  log(`seeds + ${RELAX} relax passes in ${(performance.now() - t2).toFixed(0)} ms`)

  // Cells. extent must exceed the largest cell radius; on a sphere with N seeds
  // the mean spacing is ~ sqrt(4*pi*R^2 / N).
  const spacing = Math.sqrt((4 * Math.PI * OUTER_R * OUTER_R) / SEEDS)
  const t3 = performance.now()
  const cells = buildVoronoiCells(m, seeds, { k: K, ribWidth: RIB, extent: spacing * 3 })
  log(`cells: ${cells.length} built in ${(performance.now() - t3).toFixed(0)} ms (spacing ~${spacing.toFixed(1)} mm)`)

  const t4 = performance.now()
  const cut = m.Manifold.difference([shell, ...cells])
  const tBool = performance.now() - t4
  log(`boolean: ${cut.numTri()} tris in ${tBool.toFixed(0)} ms; status=${cut.status()}`)
  for (const c of cells) c.delete()
  shell.delete()

  const t5 = performance.now()
  const parts = cut.decompose()
  const vols = parts.map((p) => p.volume()).sort((a, b) => b - a)
  log(`decompose: ${parts.length} component(s) in ${(performance.now() - t5).toFixed(0)} ms; volumes=${vols.slice(0, 5).map((v) => v.toFixed(1)).join(', ')}${vols.length > 5 ? ', ...' : ''}`)

  let result: Manifold = cut
  if (parts.length > 1) {
    // keep the largest
    let best = parts[0]
    for (const p of parts) if (p.volume() > best.volume()) best = p
    result = best
    log(`kept largest component, dropped ${parts.length - 1} island(s)`)
  }

  const tri = triMeshFromManifold(result)
  stlBuffer = writeBinaryStl(tri, 'spikeA')
  log(`total ${(performance.now() - t0).toFixed(0)} ms; STL ${(stlBuffer.byteLength / 1024).toFixed(0)} KB, ${tri.indices.length / 3} tris`)
  previewTriMesh(canvas, tri)
  runBtn.disabled = false
  dlBtn.disabled = false
  ;(window as unknown as { spikeResult: unknown }).spikeResult = { tBool, tris: tri.indices.length / 3, components: parts.length, cells: cells.length }
}

runBtn.onclick = () => run().catch((e) => log('ERROR ' + (e as Error).message))
dlBtn.onclick = () => stlBuffer && downloadBlob(stlBuffer, 'spikeA.stl')
if (params.get('auto') === '1') run().catch((e) => log('ERROR ' + (e as Error).message))
