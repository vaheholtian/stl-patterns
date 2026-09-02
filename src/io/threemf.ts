// Minimal, units-aware 3MF reader and writer (core spec + production-extension paths).
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
import type { TriMesh } from '../geom/manifold'

export interface Body {
  name: string
  mesh: TriMesh
}

export interface ThreeMfFile {
  unit: string
  bodies: Body[]
}

const UNIT_TO_MM: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
}

interface ObjectDef {
  name: string
  mesh?: TriMesh
  components: { objectid: string; path?: string; transform: number[] | null }[]
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

function parseTransform(s: string | null): number[] | null {
  if (!s) return null
  const n = s.trim().split(/\s+/).map(Number)
  return n.length === 12 && n.every((x) => isFinite(x)) ? n : null
}

/** 3MF transforms are 4x3 row-major with translation in the last row: p' = p * M */
function applyTransform(m: number[], x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[3] * y + m[6] * z + m[9],
    m[1] * x + m[4] * y + m[7] * z + m[10],
    m[2] * x + m[5] * y + m[8] * z + m[11],
  ]
}

function multiply(a: number[], b: number[]): number[] {
  // result = a then b (apply a first). Both 4x3 row-major with translation row.
  const r = new Array(12).fill(0)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
    }
  }
  const t = applyTransform(b, a[9], a[10], a[11])
  r[9] = t[0]; r[10] = t[1]; r[11] = t[2]
  return r
}

export function parse3mf(buf: ArrayBuffer): ThreeMfFile {
  const files = unzipSync(new Uint8Array(buf))
  const norm = (p: string) => p.replace(/^\//, '')
  const text = (p: string) => {
    const f = files[norm(p)]
    if (!f) throw new Error(`3MF: missing part ${p}`)
    return strFromU8(f)
  }
  // root model path from _rels/.rels
  let rootPath = '3D/3dmodel.model'
  if (files['_rels/.rels']) {
    const rels = new DOMParser().parseFromString(text('_rels/.rels'), 'application/xml')
    for (const r of Array.from(rels.getElementsByTagNameNS('*', 'Relationship'))) {
      if ((r.getAttribute('Type') ?? '').endsWith('/3dmodel')) rootPath = norm(r.getAttribute('Target') ?? rootPath)
    }
  }
  const models = new Map<string, { unit: number; objects: Map<string, ObjectDef>; doc: Document }>()
  const loadModel = (path: string) => {
    const key = norm(path)
    if (models.has(key)) return models.get(key)!
    const doc = new DOMParser().parseFromString(text(key), 'application/xml')
    const modelEl = doc.getElementsByTagNameNS('*', 'model')[0]
    const unitName = modelEl?.getAttribute('unit') ?? 'millimeter'
    const unit = UNIT_TO_MM[unitName] ?? 1
    const objects = new Map<string, ObjectDef>()
    for (const obj of Array.from(doc.getElementsByTagNameNS('*', 'object'))) {
      const id = obj.getAttribute('id') ?? ''
      const def: ObjectDef = { name: obj.getAttribute('name') ?? '', components: [] }
      const meshEl = obj.getElementsByTagNameNS('*', 'mesh')[0]
      if (meshEl) {
        const verts = Array.from(meshEl.getElementsByTagNameNS('*', 'vertex'))
        const tris = Array.from(meshEl.getElementsByTagNameNS('*', 'triangle'))
        const positions = new Float32Array(verts.length * 3)
        verts.forEach((v, i) => {
          positions[i * 3] = Number(v.getAttribute('x'))
          positions[i * 3 + 1] = Number(v.getAttribute('y'))
          positions[i * 3 + 2] = Number(v.getAttribute('z'))
        })
        const indices = new Uint32Array(tris.length * 3)
        tris.forEach((t, i) => {
          indices[i * 3] = Number(t.getAttribute('v1'))
          indices[i * 3 + 1] = Number(t.getAttribute('v2'))
          indices[i * 3 + 2] = Number(t.getAttribute('v3'))
        })
        def.mesh = { positions, indices }
      }
      for (const c of Array.from(obj.getElementsByTagNameNS('*', 'component'))) {
        const path = c.getAttributeNS('http://schemas.microsoft.com/3dmanufacturing/production/2015/06', 'path') ?? c.getAttribute('p:path')
        def.components.push({ objectid: c.getAttribute('objectid') ?? '', path: path ?? undefined, transform: parseTransform(c.getAttribute('transform')) })
      }
      objects.set(id, def)
    }
    const entry = { unit, objects, doc }
    models.set(key, entry)
    return entry
  }

  const root = loadModel(rootPath)
  const bodies: Body[] = []
  const emit = (modelPath: string, objectId: string, transform: number[], nameHint: string, depth: number) => {
    if (depth > 8) return
    const model = loadModel(modelPath)
    const def = model.objects.get(objectId)
    if (!def) return
    const name = def.name || nameHint
    if (def.mesh) {
      const src = def.mesh
      const positions = new Float32Array(src.positions.length)
      const scale = model.unit
      for (let i = 0; i < src.positions.length; i += 3) {
        const [x, y, z] = applyTransform(transform, src.positions[i], src.positions[i + 1], src.positions[i + 2])
        positions[i] = x * scale; positions[i + 1] = y * scale; positions[i + 2] = z * scale
      }
      bodies.push({ name: name || `Body ${bodies.length + 1}`, mesh: { positions, indices: new Uint32Array(src.indices) } })
    }
    def.components.forEach((c, i) => {
      const t = c.transform ? multiply(c.transform, transform) : transform
      emit(c.path ?? modelPath, c.objectid, t, `${name || 'Object'} part ${i + 1}`, depth + 1)
    })
  }
  const build = root.doc.getElementsByTagNameNS('*', 'build')[0]
  const items = build ? Array.from(build.getElementsByTagNameNS('*', 'item')) : []
  if (items.length === 0) {
    // no build section: emit every mesh object
    for (const [id] of root.objects) emit(rootPath, id, IDENTITY, '', 0)
  } else {
    for (const it of items) {
      const path = it.getAttributeNS('http://schemas.microsoft.com/3dmanufacturing/production/2015/06', 'path') ?? it.getAttribute('p:path')
      emit(path ?? rootPath, it.getAttribute('objectid') ?? '', parseTransform(it.getAttribute('transform')) ?? IDENTITY, '', 0)
    }
  }
  const unitName = root.doc.getElementsByTagNameNS('*', 'model')[0]?.getAttribute('unit') ?? 'millimeter'
  return { unit: unitName, bodies }
}

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Minimal core-spec 3MF in millimetres, one object per body, names preserved. */
export function write3mf(bodies: Body[]): Uint8Array {
  const parts: string[] = []
  parts.push('<?xml version="1.0" encoding="UTF-8"?>\n')
  parts.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n')
  parts.push(' <metadata name="Application">stl-patterns</metadata>\n')
  parts.push(' <resources>\n')
  bodies.forEach((b, i) => {
    const { positions: p, indices: ix } = b.mesh
    parts.push(`  <object id="${i + 1}" name="${xmlEscape(b.name)}" type="model">\n   <mesh>\n    <vertices>\n`)
    for (let v = 0; v < p.length; v += 3) {
      parts.push(`     <vertex x="${fmt(p[v])}" y="${fmt(p[v + 1])}" z="${fmt(p[v + 2])}"/>\n`)
    }
    parts.push('    </vertices>\n    <triangles>\n')
    for (let t = 0; t < ix.length; t += 3) {
      parts.push(`     <triangle v1="${ix[t]}" v2="${ix[t + 1]}" v3="${ix[t + 2]}"/>\n`)
    }
    parts.push('    </triangles>\n   </mesh>\n  </object>\n')
  })
  parts.push(' </resources>\n <build>\n')
  bodies.forEach((_, i) => parts.push(`  <item objectid="${i + 1}"/>\n`))
  parts.push(' </build>\n</model>\n')
  const model = parts.join('')
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>'
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    ' <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>'
  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rels),
      '3D/3dmodel.model': strToU8(model),
    },
    { level: 6 },
  )
}

function fmt(n: number): string {
  // enough precision for microns, without float noise
  return Number(n.toFixed(5)).toString()
}
