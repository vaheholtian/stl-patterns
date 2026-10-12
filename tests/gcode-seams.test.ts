import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { zipSync, strToU8, strFromU8, unzipSync } from 'fflate'
import { analyzeSeams, moveSeamsInside, fitCenter, fmt } from '../src/gcode/seams.ts'
import { md5Hex } from '../src/gcode/md5.ts'
import { readSliced, writeSliced, outputName } from '../src/gcode/gcodeFile.ts'

const R_IN = 50, R_OUT = 52, SLATS = 36

/**
 * A ring of slats the way Bambu prints them: one closed loop per slat, seam at its back
 * (+Y) corner, a small seam gap, a wipe back along the start of the loop, then a hopped travel.
 * The inner face is an arc about the ring's centre, the other three sides are lines.
 */
function slatRing(): string {
  const out = ['G90', 'M83', '; CHANGE_LAYER', '; Z_HEIGHT: 10', '; FEATURE: Outer wall']
  const rate = 0.05
  for (let k = 0; k < SLATS; k++) {
    const a0 = (k / SLATS) * 2 * Math.PI, a1 = a0 + 0.12
    const P = (r: number, a: number): [number, number] => [100 + r * Math.cos(a), 100 + r * Math.sin(a)]
    const corners = [P(R_OUT, a0), P(R_OUT, a1), P(R_IN, a1), P(R_IN, a0)]
    // start at the corner furthest toward +Y, the slicer's "back"
    let s = 0
    corners.forEach((c, i) => { if (c[1] > corners[s][1]) s = i })
    const order = [0, 1, 2, 3].map((i) => (s + i) % 4)
    const start = corners[order[0]]
    out.push(`G1 X${fmt(start[0])} Y${fmt(start[1])} Z10.4 F42000`, 'G1 Z10', 'G1 E.8 F1800', '; LINE_WIDTH: 0.42', 'G1 F6000')
    for (let i = 1; i <= 4; i++) {
      const from = corners[order[i - 1]], to = i === 4 ? start : corners[order[i]]
      let end = to
      if (i === 4) {   // stop 0.06 mm short: the seam gap
        const d = Math.hypot(to[0] - from[0], to[1] - from[1])
        end = [to[0] - (to[0] - from[0]) * 0.06 / d, to[1] - (to[1] - from[1]) * 0.06 / d]
      }
      const len = Math.hypot(end[0] - from[0], end[1] - from[1])
      // side 2 -> 3 is the inner face: an arc about the ring centre, clockwise from a1 to a0
      if (order[i - 1] === 2 && order[i % 4] === 3) {
        out.push(`G2 X${fmt(end[0])} Y${fmt(end[1])} I${fmt(100 - from[0])} J${fmt(100 - from[1])} E${fmt(R_IN * 0.12 * rate, 5)}`)
      } else out.push(`G1 X${fmt(end[0])} Y${fmt(end[1])} E${fmt(len * rate, 5)}`)
    }
    const w = corners[order[1]]
    out.push('; WIPE_START', `G1 X${fmt(w[0])} Y${fmt(w[1])} E-.76`, '; WIPE_END', 'G1 E-.04 F1800')
  }
  return out.join('\n')
}

const sumE = (g: string, sign: 1 | -1) => g.split('\n').reduce((s, l) => {
  const m = /^G[0-3] .*E(-?\d*\.?\d+)/.exec(l)
  const e = m ? parseFloat(m[1]) : 0
  return s + (Math.sign(e) === sign ? e : 0)
}, 0)

test('md5 matches the reference vectors', () => {
  assert.equal(md5Hex(strToU8('')), 'd41d8cd98f00b204e9800998ecf8427e')
  assert.equal(md5Hex(strToU8('The quick brown fox jumps over the lazy dog')), '9e107d9d372bb6826bd81d3542a419d6')
  assert.equal(md5Hex(strToU8('a'.repeat(1000))), 'cabe45dcc9ae5b66ba86600cca6b8ba8')
})

test('numbers come out the way Bambu writes them', () => {
  assert.equal(fmt(0.5), '.5'); assert.equal(fmt(-0.25), '-.25'); assert.equal(fmt(12), '12')
  assert.equal(fmt(0.0000001, 5), '0'); assert.equal(fmt(1.23456, 5), '1.23456')
})

test('the centre fit finds a ring centre', () => {
  const pts: number[] = []
  for (let i = 0; i < 40; i++) pts.push(30 + 20 * Math.cos(i), -5 + 20 * Math.sin(i))
  const c = fitCenter(pts)!
  assert.ok(Math.abs(c[0] - 30) < 1e-9 && Math.abs(c[1] + 5) < 1e-9)
})

test('a back seam lands on the outer face of the back half of a slat ring', () => {
  const r = analyzeSeams(slatRing())
  assert.equal(r.inside + r.outside + r.side, SLATS)
  assert.ok(r.outside >= SLATS / 3, `outside ${r.outside}`)
  assert.ok(r.inside >= SLATS / 3, `inside ${r.inside}`)
})

test('every slat seam moves to the middle of its inner face, extrusion and retraction unchanged', () => {
  const src = slatRing()
  const res = moveSeamsInside(src)
  assert.deepEqual(res.skipped, {})
  assert.equal(res.moved, SLATS)
  const after = analyzeSeams(res.gcode)
  assert.equal(after.inside, SLATS)
  for (const s of after.layers[0].seams) {
    const r = Math.hypot(s.x - 100, s.y - 100)
    assert.ok(Math.abs(r - R_IN) < 0.01, `seam on the inner arc (r ${r})`)
  }
  assert.ok(Math.abs(sumE(res.gcode, 1) - sumE(src, 1)) < 1e-3, 'same filament')
  assert.ok(Math.abs(sumE(res.gcode, -1) - sumE(src, -1)) < 1e-3, 'same retraction')
  // the loop still closes on itself, short by the seam gap
  const lines = res.gcode.split('\n')
  const travel = lines.findIndex((l) => l.includes('Z10.4'))
  const t = /X(\S+) Y(\S+)/.exec(lines[travel])!
  const lastExtrude = lines.slice(travel).findIndex((l) => l.startsWith('; WIPE_START')) + travel - 1
  const e = /X(\S+) Y(\S+)/.exec(lines[lastExtrude])!
  const gap = Math.hypot(+t[1] - +e[1], +t[2] - +e[2])
  assert.ok(gap > 0.04 && gap < 0.08, `seam gap ${gap}`)
})

test('the split inner arc stays an arc about the same centre', () => {
  const res = moveSeamsInside(slatRing())
  let x = 0, y = 0
  for (const l of res.gcode.split('\n')) {
    const w = Object.fromEntries([...l.split(';')[0].matchAll(/([XYIJ])(-?\d*\.?\d+)/g)].map((m) => [m[1], +m[2]]))
    if (/^G2 /.test(l)) {
      const cx = x + w.I, cy = y + w.J
      assert.ok(Math.abs(cx - 100) < 0.01 && Math.abs(cy - 100) < 0.01, 'arc centre')
      assert.ok(Math.abs(Math.hypot(w.X - cx, w.Y - cy) - Math.hypot(x - cx, y - cy)) < 0.005, 'arc radius')
    }
    if (/^G[0-3] /.test(l)) { x = w.X ?? x; y = w.Y ?? y }
  }
})

test('a ring of wall round the whole part keeps its seam', () => {
  const pts = Array.from({ length: 13 }, (_, i) => [100 + 50 * Math.cos(i / 12 * 2 * Math.PI), 100 + 50 * Math.sin(i / 12 * 2 * Math.PI)])
  const g = ['G90', 'M83', '; CHANGE_LAYER', '; FEATURE: Outer wall', `G1 X${fmt(pts[0][0])} Y${fmt(pts[0][1])} F42000`, 'G1 E.8 F1800', 'G1 F6000',
    ...pts.slice(1).map(([px, py]) => `G1 X${fmt(px)} Y${fmt(py)} E.1`)].join('\n')
  const res = moveSeamsInside(g)
  assert.equal(res.moved, 0)
  assert.equal(res.gcode, g)
  assert.equal(analyzeSeams(g).untouched, 1)
})

test('absolute extrusion is refused rather than mangled', () => {
  assert.throws(() => moveSeamsInside(slatRing().replace('M83', 'M82')), /M82/)
})

test('a real Bambu layer of 109 slats: every closed slat loop ends up inside', () => {
  const src = readFileSync(new URL('../fixtures/slats-layer100.gcode', import.meta.url), 'utf8')
  const before = analyzeSeams(src)
  assert.ok(before.outside > 20, `outside before ${before.outside}`)
  const res = moveSeamsInside(src)
  const after = analyzeSeams(res.gcode)
  assert.equal(after.outside + after.side, 0)
  assert.equal(after.inside, before.inside + before.outside + before.side)
  assert.ok(Math.abs(sumE(res.gcode, 1) - sumE(src, 1)) < 0.01, 'same filament')
  assert.ok(Math.abs(sumE(res.gcode, -1) - sumE(src, -1)) < 1e-3, 'same retraction')
  // a second pass has nothing left to do
  assert.equal(moveSeamsInside(res.gcode).moved, 0)
})

test('a .gcode.3mf comes back with the plate rewritten and its md5 updated, the rest untouched', () => {
  const gcode = slatRing()
  const zip = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'Metadata/plate_1.gcode': strToU8(gcode),
    'Metadata/plate_1.gcode.md5': strToU8(md5Hex(strToU8(gcode)).toUpperCase()),
    'Metadata/plate_1.png': new Uint8Array([1, 2, 3]),
  })
  const file = readSliced('cup.gcode.3mf', zip.buffer as ArrayBuffer)
  assert.equal(file.kind, '3mf')
  assert.equal(file.plates.length, 1)
  const res = moveSeamsInside(file.plates[0].gcode)
  const out = unzipSync(writeSliced(file, new Map([[file.plates[0].path, res.gcode]])))
  assert.deepEqual(Object.keys(out), ['[Content_Types].xml', 'Metadata/plate_1.gcode', 'Metadata/plate_1.gcode.md5', 'Metadata/plate_1.png'])
  assert.equal(strFromU8(out['Metadata/plate_1.gcode']), res.gcode)
  assert.equal(strFromU8(out['Metadata/plate_1.gcode.md5']), md5Hex(out['Metadata/plate_1.gcode']).toUpperCase())
  assert.deepEqual([...out['Metadata/plate_1.png']], [1, 2, 3])
  assert.equal(outputName('cup.gcode.3mf'), 'cup-inner-seams.gcode.3mf')
  assert.equal(outputName('cup.gcode'), 'cup-inner-seams.gcode')
})
