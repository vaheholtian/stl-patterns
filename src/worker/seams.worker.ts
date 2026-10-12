// Seam placement off the main thread: a sliced plate is ~10 MB of G-code.
import { analyzeSeams, moveSeamsInside, type SeamReport } from '../gcode/seams'
import { outputName, readSliced, writeSliced } from '../gcode/gcodeFile'

export interface SeamJob { name: string; buf: ArrayBuffer }

export interface PlateOutcome {
  path: string
  before: SeamReport
  after: SeamReport
  moved: number
  alreadyInside: number
  skipped: Record<string, number>
}

export type SeamReply =
  | { ok: true; name: string; bytes: Uint8Array; plates: PlateOutcome[] }
  | { ok: false; error: string }

self.onmessage = (ev: MessageEvent<SeamJob>) => {
  try {
    const file = readSliced(ev.data.name, ev.data.buf)
    const rewritten = new Map<string, string>()
    const plates: PlateOutcome[] = file.plates.map((pl) => {
      const res = moveSeamsInside(pl.gcode)
      rewritten.set(pl.path, res.gcode)
      return {
        path: pl.path,
        before: analyzeSeams(pl.gcode),
        after: analyzeSeams(res.gcode),
        moved: res.moved, alreadyInside: res.alreadyInside, skipped: res.skipped,
      }
    })
    const bytes = writeSliced(file, rewritten)
    const reply: SeamReply = { ok: true, name: outputName(file.name), bytes, plates }
    ;(self as unknown as Worker).postMessage(reply, [bytes.buffer])
  } catch (e) {
    const reply: SeamReply = { ok: false, error: e instanceof Error ? e.message : String(e) }
    ;(self as unknown as Worker).postMessage(reply)
  }
}
