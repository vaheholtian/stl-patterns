import { useCallback, useEffect, useRef, useState } from 'react'
import Viewer from './Viewer'
import { useStore, selectionToRegion } from '../state/store'
import { loadMeshFile } from '../io/load'
import { writeBinaryStl } from '../io/stl'
import { write3mf } from '../io/threemf'
import { downloadBlob } from '../io/download'
import { geomClient } from '../worker/client'
import type { PickResult, SceneManager } from '../viewer/SceneManager'
import VoronoiPanel from './panels/VoronoiPanel'

export default function ApplyScreen() {
  const bodies = useStore((s) => s.bodies)
  const activeBodyId = useStore((s) => s.activeBodyId)
  const selection = useStore((s) => s.selection)
  const segmentAngle = useStore((s) => s.segmentAngle)
  const busy = useStore((s) => s.busy)
  const log = useStore((s) => s.log)
  const st = useStore.getState
  const smRef = useRef<SceneManager | null>(null)
  const [over, setOver] = useState(false)
  const active = bodies.find((b) => b.id === activeBodyId) ?? null

  const onFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try {
        st().setBusy(`loading ${f.name}`)
        const loaded = await loadMeshFile(f)
        st().addBodies(loaded)
        st().pushLog(loaded.map((b) => `loaded ${b.name}: ${b.info}`))
        // manifold check in the worker
        for (const b of loaded) {
          try {
            const r = await geomClient().check(b.mesh)
            st().pushLog(`${b.name}: watertight, volume ${r.volume.toFixed(0)} mm³, area ${r.area.toFixed(0)} mm²`)
          } catch (e) {
            st().pushLog(`${b.name}: NOT watertight (${(e as Error).message}). Fix the model in Onshape before patterning.`)
          }
        }
      } catch (e) {
        st().pushLog(`failed to load ${f.name}: ${(e as Error).message}`)
      } finally {
        st().setBusy(null)
      }
    }
  }

  // dev convenience: ?load=<url> fetches a file at startup
  const loadedFromUrl = useRef(false)
  useEffect(() => {
    if (loadedFromUrl.current) return
    loadedFromUrl.current = true
    const url = new URLSearchParams(location.search).get('load')
    if (!url) return
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        const blob = await r.blob()
        const name = url.split('/').pop() ?? 'model'
        await onFiles([new File([blob], name)])
      })
      .catch((e) => st().pushLog(`could not load ${url}: ${(e as Error).message}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPick = useCallback((hit: PickResult, ev: PointerEvent) => {
    const s = st()
    if (hit.bodyId !== s.activeBodyId) { s.setActive(hit.bodyId); return }
    const adj = s.adjacencyFor(hit.bodyId)
    if (!adj) return
    const tris = adj.floodFill(hit.faceIndex, s.segmentAngle)
    const nTri = adj.nTri
    let mask: Uint8Array
    if (ev.shiftKey && s.selection) mask = new Uint8Array(s.selection)
    else if (ev.altKey && s.selection) mask = new Uint8Array(s.selection)
    else mask = new Uint8Array(nTri)
    const val = ev.altKey ? 0 : 1
    for (const t of tris) mask[t] = val
    s.setSelection(mask)
  }, [st])

  const selectAll = () => {
    if (!active) return
    const mask = new Uint8Array(active.mesh.indices.length / 3).fill(1)
    st().setSelection(mask)
  }
  const selectedCount = selection ? selection.reduce((a, b) => a + b, 0) : 0

  const exportBodies = (kind: 'stl' | '3mf') => {
    const list = bodies.filter((b) => b.visible)
    if (!list.length) return
    const name = list.length === 1 ? list[0].name : 'stl-patterns'
    if (kind === 'stl') {
      // STL has no objects; merge visible bodies into one soup
      let nV = 0, nI = 0
      for (const b of list) { nV += b.mesh.positions.length; nI += b.mesh.indices.length }
      const positions = new Float32Array(nV), indices = new Uint32Array(nI)
      let ov = 0, oi = 0
      for (const b of list) {
        positions.set(b.mesh.positions, ov)
        for (let i = 0; i < b.mesh.indices.length; i++) indices[oi + i] = b.mesh.indices[i] + ov / 3
        ov += b.mesh.positions.length; oi += b.mesh.indices.length
      }
      downloadBlob(writeBinaryStl({ positions, indices }, name), `${name}.stl`)
    } else {
      const zip = write3mf(list.map((b) => ({ name: b.name, mesh: b.mesh })))
      downloadBlob(new Blob([zip as BlobPart], { type: 'model/3mf' }), `${name}.3mf`)
    }
    st().pushLog(`exported ${list.length} body(ies) as ${kind.toUpperCase()}`)
  }

  const region = active ? selectionToRegion(selection, active.mesh.indices.length / 3) : null

  return (
    <div className="apply">
      <div className="sidebar">
        <div
          className={'dropzone' + (over ? ' over' : '')}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files) }}
        >
          Drop STL or 3MF here, or{' '}
          <label style={{ color: 'var(--accent2)', cursor: 'pointer' }}>
            browse
            <input type="file" accept=".stl,.3mf" multiple style={{ display: 'none' }} onChange={(e) => e.target.files && onFiles(e.target.files)} />
          </label>
        </div>

        <div className="section">
          <h3>Bodies</h3>
          {bodies.length === 0 && <div className="muted">Nothing loaded.</div>}
          <div className="bodies">
            {bodies.map((b) => (
              <div key={b.id} className={'body-row' + (b.id === activeBodyId ? ' active' : '')} onClick={() => st().setActive(b.id)}>
                <input type="checkbox" checked={b.visible} onClick={(e) => e.stopPropagation()} onChange={() => st().toggleVisible(b.id)} title="visible" />
                <span className="name" title={b.name}>{b.name}</span>
                <span className="muted">{(b.mesh.indices.length / 3).toLocaleString()} △</span>
                {b.history.length > 0 && <button className="small" onClick={(e) => { e.stopPropagation(); st().undo(b.id) }} title="undo last operation">↶</button>}
                <button className="small" onClick={(e) => { e.stopPropagation(); st().removeBody(b.id) }} title="remove">✕</button>
              </div>
            ))}
          </div>
          {bodies.length > 0 && <div className="row" style={{ marginTop: 6 }}><button className="small" onClick={() => smRef.current?.fitAll()}>Fit view</button></div>}
        </div>

        <div className="section">
          <h3>Region</h3>
          <div className="field">
            <label>Stop at edges sharper than {segmentAngle}°</label>
            <input type="range" min={5} max={90} step={1} value={segmentAngle} onChange={(e) => st().setSegmentAngle(Number(e.target.value))} />
          </div>
          <div className="row wrap">
            <button className="small" disabled={!active} onClick={selectAll}>Whole body</button>
            <button className="small" disabled={!selection} onClick={() => st().setSelection(null)}>Clear</button>
            <span className="muted">{selection ? `${selectedCount.toLocaleString()} triangles` : active ? 'whole body' : 'no body'}</span>
          </div>
          <div className="muted">Click a face to select its smooth region. Shift adds, Alt removes.</div>
        </div>

        <VoronoiPanel region={region} />

        <div className="section">
          <h3>Export</h3>
          <div className="row">
            <button disabled={!bodies.length || !!busy} onClick={() => exportBodies('3mf')}>3MF</button>
            <button disabled={!bodies.length || !!busy} onClick={() => exportBodies('stl')}>STL</button>
            <span className="muted">visible bodies, mm</span>
          </div>
        </div>

        <div className="section">
          <h3>Log <button className="small" style={{ float: 'right' }} onClick={() => st().clearLog()}>clear</button></h3>
          <div className="log">
            {log.map((l, i) => <div key={i} className={i === log.length - 1 ? 'last' : ''}>{l}</div>)}
          </div>
        </div>
      </div>
      <Viewer onPick={onPick} onReady={(sm) => (smRef.current = sm)} />
    </div>
  )
}
