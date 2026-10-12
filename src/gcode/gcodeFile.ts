// Read and rewrite the G-code inside a sliced file: a Bambu/Orca .gcode.3mf (one G-code
// per plate, each with an MD5 beside it) or a plain .gcode.
import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from 'fflate'
import { md5Hex } from './md5'

export interface Plate {
  /** path inside the archive, or the file name for plain G-code */
  path: string
  gcode: string
}

export interface SlicedFile {
  kind: '3mf' | 'gcode'
  name: string
  plates: Plate[]
  /** every archive entry, for writing back what we do not touch */
  entries?: Record<string, Uint8Array>
}

const PLATE = /^Metadata\/plate_\d+\.gcode$/

export function readSliced(name: string, buf: ArrayBuffer): SlicedFile {
  const bytes = new Uint8Array(buf)
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b
  if (!zip) return { kind: 'gcode', name, plates: [{ path: name, gcode: strFromU8(bytes) }] }
  const entries = unzipSync(bytes)
  const plates = Object.keys(entries).filter((p) => PLATE.test(p)).sort()
    .map((path) => ({ path, gcode: strFromU8(entries[path]) }))
  if (!plates.length) throw new Error('No sliced G-code in this 3MF. Slice it and use "Export plate sliced file" (.gcode.3mf).')
  return { kind: '3mf', name, plates, entries }
}

/** The same file with each plate's G-code replaced, and its MD5 updated. */
export function writeSliced(file: SlicedFile, gcode: Map<string, string>): Uint8Array {
  if (file.kind === 'gcode') return strToU8(gcode.get(file.plates[0].path) ?? file.plates[0].gcode)
  const out: Zippable = {}
  for (const [path, data] of Object.entries(file.entries!)) {
    const replaced = gcode.get(path)
    const md5For = path.endsWith('.gcode.md5') ? gcode.get(path.slice(0, -4)) : undefined
    if (replaced !== undefined) out[path] = strToU8(replaced)
    else if (md5For !== undefined) {
      const old = strFromU8(data).trim()
      const hex = md5Hex(strToU8(md5For))
      out[path] = strToU8(old === old.toLowerCase() ? hex : hex.toUpperCase())
    } else out[path] = [data, { level: path.endsWith('.png') ? 0 : 6 }]
  }
  return zipSync(out, { level: 6 })
}

/** "part.gcode.3mf" -> "part-inner-seams.gcode.3mf" */
export function outputName(name: string): string {
  const m = /(\.gcode\.3mf|\.3mf|\.gcode)$/i.exec(name)
  return m ? name.slice(0, m.index) + '-inner-seams' + m[0] : name + '-inner-seams.gcode'
}
