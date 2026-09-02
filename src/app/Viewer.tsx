import { useEffect, useRef } from 'react'
import { SceneManager, type PickResult } from '../viewer/SceneManager'
import { useStore } from '../state/store'

interface Props {
  onPick?: (hit: PickResult, ev: PointerEvent) => void
  onReady?: (sm: SceneManager) => void
}

/** Canvas host for the three.js scene; keeps the scene in sync with the store. */
export default function Viewer({ onPick, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const smRef = useRef<SceneManager | null>(null)
  const bodies = useStore((s) => s.bodies)
  const activeBodyId = useStore((s) => s.activeBodyId)
  const selection = useStore((s) => s.selection)

  useEffect(() => {
    const sm = new SceneManager(canvasRef.current!)
    smRef.current = sm
    const ro = new ResizeObserver(() => sm.resize())
    ro.observe(canvasRef.current!)
    onReady?.(sm)
    ;(window as unknown as { __scene: SceneManager }).__scene = sm // dev/automation hook
    ;(window as unknown as { __store: typeof useStore }).__store = useStore
    return () => { ro.disconnect(); sm.dispose(); smRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const sm = smRef.current
    if (!sm) return
    sm.onPick = onPick ?? null
    sm.onHover = (hit) => sm.setHover(hit && hit.bodyId === useStore.getState().activeBodyId ? { bodyId: hit.bodyId, face: hit.faceIndex } : null)
  }, [onPick])

  const prevCount = useRef(0)
  useEffect(() => {
    const sm = smRef.current
    if (!sm) return
    sm.setBodies(bodies.map((b) => ({ id: b.id, mesh: b.mesh, visible: b.visible })))
    sm.setActive(activeBodyId)
    sm.setSelection(selection)
    if (bodies.length !== prevCount.current) { sm.fitAll(); prevCount.current = bodies.length }
  }, [bodies, activeBodyId, selection])

  return (
    <div className="viewport">
      <canvas ref={canvasRef} />
      <div className="hint">drag: orbit · wheel: zoom · right-drag: pan · click: select region · shift: add · alt: remove</div>
    </div>
  )
}
