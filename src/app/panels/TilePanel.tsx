import { useNotifications } from '../../state/notifications'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Vector3 } from 'three'
import { useStore } from '../../state/store'
import { useTileStore, resolveDef } from '../../state/tileStore'
import { geomClient } from '../../worker/client'
import { PreviewClient } from '../../worker/preview-client'
import { regionCentroid, isBackSide, reframePieces, type FlattenedPiece } from '../../geom/regionFlatten'
import type { PickResult } from '../../viewer/SceneManager'
import { buildParameterization, fittedTileSize, polygonsToSurfaceSegments, toolMitres, type LayoutResult } from '../../geom/layout'
import { getScene } from '../../viewer/sceneRef'
import type { Pt } from '../../patterns/types'
import { generatorById, isSeamless } from '../../patterns'
import { toolOffsetRange } from '../../geom/tileTool'

interface Props {
  region: Uint32Array | null
  /** the tile-or-surface switch a Voronoi tile gets, rendered by the Apply screen so both panels show the same one */
  methodPicker?: ReactNode
}

export default function TilePanel({ region, methodPicker }: Props) {
  const tl = useStore((s) => s.tileLayout)
  const set = useStore((s) => s.setTileLayout)
  const pickMode = useStore((s) => s.pickMode)
  const setPickMode = useStore((s) => s.setPickMode)
  const busy = useStore((s) => s.busy)
  const activeBodyId = useStore((s) => s.activeBodyId)
  const mesh = useStore((s) => s.bodies.find((b) => b.id === s.activeBodyId)?.mesh)
  const segmentAngle = useStore((s) => s.segmentAngle)
  const st = useStore.getState
  const tile = useTileStore((s) => s.tile)
  const tilePolys = useTileStore((s) => s.polygons)
  const tileName = useTileStore((s) => s.def.name)
  const tileDef = useTileStore((s) => s.def)
  const lineWidth = useStore((s) => s.lineWidth)
  const gen = tileDef.generatorId === 'svg' ? undefined : generatorById(tileDef.generatorId)
  const resolved = useMemo(() => resolveDef(tileDef), [tileDef])
  const single = tl.fit === 'single' || (tl.fit === 'auto' && tileDef.generatorId !== 'svg' && !resolved.mirror && !isSeamless(gen, resolved.params))
  // the region is flattened as its smooth pieces (a whole box is six faces, not one sheet)
  const [flat, setFlat] = useState<FlattenedPiece[] | null>(null)
  const [layout, setLayout] = useState<LayoutResult[] | null>(null)
  const [info, setInfo] = useState<string[]>([])
  const [previewError, setPreviewError] = useState('')
  const [hasPreviewed, setHasPreviewed] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const surfaceInput = useMemo(() => ({ mesh, region, activeBodyId, segmentAngle, joinEdges: tl.joinEdges, levelRows: tl.levelRows }),
    [mesh, region, activeBodyId, segmentAngle, tl.joinEdges, tl.levelRows])
  const [preparedInput, setPreparedInput] = useState<typeof surfaceInput | null>(null)
  const currentSurface = useRef(surfaceInput)
  currentSurface.current = surfaceInput
  const preparationId = useRef(0)
  const surfaceReady = preparedInput === surfaceInput && !!flat
  const layoutInput = useMemo(() => ({ flat, tile, tilePolys, tileDef, resolved, single, lineWidth, origin: tl.origin,
    offset: tl.offset, rotation: tl.rotationDeg, scale: tl.scale, margin: tl.margin, marginPerSurface: tl.marginPerSurface,
    fitSeam: tl.fitSeam, minScale: tl.minScale, mode: tl.mode, wallThickness: tl.wallThickness, depth: tl.depth, surfaceReady }),
  [flat, tile, tilePolys, tileDef, resolved, single, lineWidth, tl.origin, tl.offset, tl.rotationDeg, tl.scale, tl.margin,
    tl.marginPerSurface, tl.fitSeam, tl.minScale, tl.mode, tl.wallThickness, tl.depth, surfaceReady])
  const [renderedInput, setRenderedInput] = useState<typeof layoutInput | null>(null)
  const previewReady = surfaceReady && renderedInput === layoutInput && !!layout && layout.some((p) => p.polygons.length > 0)

  // Surface preparation belongs to this exact mesh, selection and set of surface options.
  useEffect(() => {
    setFlat(null); setLayout(null); setInfo([]); setPreviewError('')
    getScene()?.setOverlayLines(null)
    getScene()?.setMarkers([])
    st().setPickMode('region')
  }, [surfaceInput, st])
  // switching to surface generation unmounts this panel: its preview leaves the viewport with it
  useEffect(() => () => {
    getScene()?.setOverlayLines(null)
    getScene()?.setMarkers([])
    st().setPickMode('region')
  }, [st])

  const flatten = async (originOverride?: [number, number, number]) => {
    const s = st()
    const body = s.bodies.find((b) => b.id === s.activeBodyId)
    if (!body || !region || s.busy) return
    const requestId = ++preparationId.current
    const input = surfaceInput
    const origin = originOverride ?? tl.origin ?? regionCentroid(body.mesh, region)
    if (!tl.origin) set({ origin })
    setFlat(null); setLayout(null); setInfo([]); setPreviewError(''); setHasPreviewed(true)
    setPreparing(true)
    getScene()?.setOverlayLines(null)
    s.setBusy('Preparing preview')
    try {
      const res = await geomClient().flattenPieces(body.mesh, region, origin, s.segmentAngle, s.tileLayout.joinEdges !== false, s.tileLayout.levelRows !== false, (p) => st().setBusy(p))
      if (requestId !== preparationId.current || currentSurface.current !== input) return
      if (!res.pieces.length) throw new Error('no piece of the region could be flattened')
      setFlat(res.pieces)
      setPreparedInput(input)
      st().pushLog(res.log)
    } catch (e) {
      if (requestId !== preparationId.current || currentSurface.current !== input) return
      const message = (e as Error).message
      setPreviewError(message === 'cancelled' ? 'Preview cancelled. Try again when ready.' : `Preview failed: ${message}`)
      st().pushLog(`preview failed: ${message}`)
    } finally {
      setPreparing(false)
      st().setBusy(null)
    }
  }

  // re-layout whenever inputs change
  const [previewClient] = useState(() => new PreviewClient())
  useEffect(() => () => previewClient.dispose(), [previewClient])
  const layoutTimer = useRef<number | null>(null)
  const singleCache = useRef<Map<string, { polys: Pt[][]; tw: number; th: number }>>(new Map())
  useEffect(() => {
    setLayout(null)
    setPreviewError('')
    getScene()?.setOverlayLines(new Float32Array())
    if (!surfaceReady || !flat || !tile || !tl.origin) return
    let cancelled = false
    if (layoutTimer.current) clearTimeout(layoutTimer.current)
    layoutTimer.current = window.setTimeout(async () => {
      try {
        const base = {
          offset: tl.offset ?? [0, 0],
          rotationDeg: tl.rotationDeg,
          scale: tl.scale,
          margin: tl.margin,
          marginPerSurface: tl.marginPerSurface,
          fitSeam: tl.fitSeam,
          minScale: tl.minScale,
          single,
          // the tool must reach past each fold to the mitre plane shared with the neighbouring face
          normalRange: toolOffsetRange(tl.mode, tl.depth, tl.wallThickness),
        }
        const results: LayoutResult[] = []
        const segments: Float32Array[] = []
        let shapes = 0, sMin = Infinity, sMax = 0, masked = 0
        const notes: string[] = []
        // a through-cut from the front of a wall already perforates its back: cutting the
        // back too, with an independently placed pattern, would chop the wall into islands
        const active = flat.filter((piece) => !isBackSide(piece, tl.mode, tl.wallThickness))
        if (active.length < flat.length) notes.push(`${flat.length - active.length} piece(s) left alone: the back of a wall cut through from the other side`)
        // a single copy must cover the whole sheet, not just the piece it is generated for
        const sheetSize = new Map<number, { width: number; height: number; period: number | null }>()
        if (single) for (const piece of active) {
          const size = fittedTileSize(piece, { ...base, origin: piece.origin })
          const prev = sheetSize.get(piece.sheet)
          sheetSize.set(piece.sheet, prev ? { width: Math.max(prev.width, size.width), height: Math.max(prev.height, size.height), period: prev.period ?? size.period } : size)
        }
        for (const piece of active) {
          // the user's origin drives the sheet it lies on; other sheets are centred on their largest piece
          const settings = { ...base, origin: piece.origin }
          let polys = tilePolys
          let tw = tile.width, th = tile.height
          if (single) {
            // generate the pattern once at the size of the flattened sheet (rounded so
            // small origin moves reuse the cached result)
            const size = sheetSize.get(piece.sheet)!
            tw = Math.ceil(size.width); th = Math.ceil(size.height)
            if (size.period) tw = size.period // a ring must wrap exactly once
            const key = JSON.stringify([tileDef.generatorId, resolved.params, tileDef.invert, tileDef.connectMaterial, tileDef.seamless, resolved.mirror, tw, th, lineWidth, tileDef.svgTile ? tileDef.svgTile.polygons.length : 0, tl.mode, tl.scale])
            const cached = singleCache.current.get(key)
            if (cached) {
              polys = cached.polys; tw = cached.tw; th = cached.th
            } else {
              const generated = await previewClient.generate({ def: tileDef, lineWidth, mode: tl.mode, scale: tl.scale, size: { width: tw, height: th } })
              if (cancelled) return
              polys = generated.polygons
              if (generated.tile) { tw = generated.tile.width; th = generated.tile.height }
              notes.push(...generated.warnings)
              if (singleCache.current.size > 64) singleCache.current.clear()
              singleCache.current.set(key, { polys, tw, th })
            }
          }
          const laid = await previewClient.layout({ flat: piece, polygons: polys, width: tw, height: th, settings })
          if (cancelled) return
          const res = { ...laid, param: buildParameterization(piece, settings).param }
          results.push(res)
          shapes += res.polygons.length
          if (res.polygons.length) { sMin = Math.min(sMin, res.scaleMin); sMax = Math.max(sMax, res.scaleMax) }
          if (active.length === 1) notes.push(...res.log)
          else for (const l of res.log) {
            if (l.startsWith('left solid')) masked++
            if ((l.includes('automatic seam fit unsupported') || l.includes('closing edge') || l.includes('meets itself')) && !notes.includes(l)) notes.push(l)
          }
          segments.push(polygonsToSurfaceSegments(res.param, res.polygons))
        }
        if (active.length > 1) {
          notes.unshift(`${shapes} shapes over ${active.length} pieces; local size ranges ${(sMin * 100).toFixed(0)}% to ${(sMax * 100).toFixed(0)}% of the chosen size`)
          if (masked) notes.push(`left solid where the pattern would shrink below ${(tl.minScale * 100).toFixed(0)}% (${masked} pieces affected)`)
        }
        setLayout(results)
        setRenderedInput(layoutInput)
        setInfo(notes)
        useNotifications.getState().show('layout', 'Tile layout', notes)
        const scene = getScene()
        if (scene) {
          let n = 0
          for (const s of segments) n += s.length
          const all = new Float32Array(n)
          let o = 0
          for (const s of segments) { all.set(s, o); o += s.length }
          scene.setOverlayLines(all)
          scene.setMarkers([{ position: new Vector3(...tl.origin!), color: 0x4cff7a }])
        }
      } catch (e) {
        if (cancelled) return
        setInfo([`layout failed: ${(e as Error).message}`])
        setPreviewError(`Preview failed: ${(e as Error).message}`)
        useNotifications.getState().show('layout', 'Tile layout', [`Layout failed: ${(e as Error).message}`], 'error')
        setLayout(null)
      }
    }, 60)
    return () => { cancelled = true; if (layoutTimer.current) clearTimeout(layoutTimer.current); previewClient.cancel() }
  }, [previewClient, layoutInput, flat, tile, tilePolys, tileDef, resolved, single, lineWidth, surfaceReady,
    tl.origin, tl.offset, tl.rotationDeg, tl.scale, tl.margin, tl.marginPerSurface, tl.fitSeam, tl.minScale, tl.mode, tl.wallThickness, tl.depth])

  // when the origin is picked, the pieces that centre on it (and any far-side cap) move: re-flatten
  const lastOrigin = useRef<string>('')
  useEffect(() => {
    if (!tl.origin) return
    const k = tl.origin.join(',')
    if (lastOrigin.current && lastOrigin.current !== k && flat && surfaceReady) {
      if (flat.length > 1 || flat[0].topology === 'cap') flatten(tl.origin)
      // one piece: its sheet recentres on the new origin at once, no flattening needed
      else if (reframePieces(flat, tl.origin)) setFlat([...flat])
    }
    lastOrigin.current = k
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.origin])

  // dragging on the surface: the pattern follows the pointer. The frame at the start
  // of the drag is kept, so re-layouts arriving mid-drag do not make it jump.
  const latest = useRef({ flat, layout, tl, activeBodyId })
  latest.current = { flat, layout, tl, activeBodyId }
  const drag = useRef<{ sheet: number; start: [number, number]; offset0: [number, number]; rot: number; scale: number; uvOf: (hit: PickResult) => { sheet: number; uv: [number, number] } | null } | null>(null)
  useEffect(() => {
    const sm = getScene()
    if (!sm || pickMode !== 'move') return
    sm.dragHandlers = {
      start: (hit) => {
        const { flat, layout, tl, activeBodyId } = latest.current
        if (!flat || !layout || hit.bodyId !== activeBodyId) return false
        const active = flat.filter((piece) => !isBackSide(piece, tl.mode, tl.wallThickness))
        // source triangle -> (layout index, triangle of the flattened piece): the flattened mesh keeps the region's order, minus any far-side cap
        const triOf = new Map<number, [number, number]>()
        active.forEach((piece, i) => {
          if (!layout[i]) return
          const removed = new Set(piece.removedCap)
          let k = 0
          for (const t of piece.region) { if (removed.has(t)) continue; triOf.set(t, [i, k++]) }
          if (k !== layout[i].param.sub.indices.length / 3) for (const t of piece.region) triOf.delete(t)
        })
        const uvOf = (h: PickResult) => {
          const e = triOf.get(h.faceIndex)
          if (!e) return null
          const [i, t] = e
          return { sheet: active[i].sheet, uv: layout[i].param.uvAt3D(t, h.point.x, h.point.y, h.point.z) }
        }
        const r = uvOf(hit)
        if (!r) return false
        drag.current = { sheet: r.sheet, start: r.uv, offset0: tl.offset ?? [0, 0], rot: tl.rotationDeg, scale: tl.scale, uvOf }
        return true
      },
      move: (hit) => {
        const d = drag.current
        if (!d || !hit) return
        const r = d.uvOf(hit)
        if (!r || r.sheet !== d.sheet) return
        // the layout frame is the surface frame rotated and scaled: undo both for millimetres on the surface
        const du = r.uv[0] - d.start[0], dv = r.uv[1] - d.start[1]
        const a = (-d.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
        const sx = d.scale * (c * du - sn * dv), sy = d.scale * (sn * du + c * dv)
        set({ offset: [Math.round((d.offset0[0] + sx) * 10) / 10, Math.round((d.offset0[1] + sy) * 10) / 10] })
      },
      end: () => { drag.current = null },
    }
    return () => { sm.dragHandlers = null; drag.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickMode])
  const off = tl.offset ?? [0, 0]

  const apply = async () => {
    const s = st()
    const body = s.bodies.find((b) => b.id === s.activeBodyId)
    if (!body || !layout || !flat || !previewReady || s.busy) return
    setPickMode('region')
    s.setBusy('tile: Preparing pattern', 0)
    try {
      const pack = (p: Pt[]) => { const f = new Float32Array(p.length * 2); p.forEach(([x, y], i) => { f[i * 2] = x; f[i * 2 + 1] = y }); return f }
      const active = flat.filter((piece) => !isBackSide(piece, tl.mode, tl.wallThickness))
      const pieces = layout.map((l, i) => ({
        polygons: l.polygons.map(pack),
        foldPolygons: l.foldPolygons.map(pack),
        mitres: active[i] ? toolMitres(active[i], l) : [],
        positions: l.param.sub.positions,
        indices: l.param.sub.indices,
        normals: l.param.sub.normals,
        uv: l.param.uv,
      })).filter((p) => p.polygons.length)
      const result = await geomClient().tile(body.mesh, {
        pieces,
        mode: tl.mode,
        depth: tl.depth,
        minIslandVolume: tl.minIslandVolume,
        wallThickness: tl.wallThickness,
        detail: tl.detail,
        minFeature: lineWidth * 2,
      }, (p, fraction) => st().setBusy(`tile: ${p}`, fraction))
      st().replaceMesh(body.id, result.mesh)
      st().pushLog(['Tiled pattern applied', ...result.log])
      const thin = result.thinParts ?? result.parts
      if (result.parts > 1) useNotifications.getState().show('tile', 'Tiled pattern', [`The result is ${result.parts} separate parts of material. The pattern has cut the body into pieces that would print separately: try inverting the pattern, connecting its material, a larger scale or a wider margin.`], 'error')
      else if (thin > 1) useNotifications.getState().show('tile', 'Tiled pattern', [`This looks like one part but only holds together on connections thinner than ${(lineWidth * 2).toFixed(2)} mm, which the printer cannot lay down. It would come off the plate as ${thin} pieces: try inverting the pattern, connecting its material, a larger scale or a wider margin.`], 'error')
      getScene()?.setOverlayLines(null)
      setFlat(null); setLayout(null)
    } catch (e) {
      if ((e as Error).message !== 'cancelled') st().pushLog(`tile failed: ${(e as Error).message}`)
    } finally {
      st().setBusy(null)
    }
  }

  const topologyNote = (pieces: FlattenedPiece[]) => {
    if (pieces.length === 1) {
      const t = pieces[0].topology
      return t === 'seam' ? 'ring-shaped: tile wraps around' : t === 'cap' ? 'closed: far-side cap left solid' : 'open surface'
    }
    const caps = pieces.filter((p) => p.topology === 'cap').length, seams = pieces.filter((p) => p.topology === 'seam').length
    const sheets = new Set(pieces.map((p) => p.sheet)).size
    const how = sheets === pieces.length ? 'each patterned on its own'
      : sheets === 1 ? 'unfolded into one sheet so the pattern continues across the edges'
      : `unfolded into ${sheets} sheets; the pattern continues across edges within a sheet`
    return `${pieces.length} smooth pieces (split at ${segmentAngle}°), ${how}` + (caps ? `; ${caps} closed` : '') + (seams ? `; ${seams} ring-shaped` : '')
  }

  // Some options only act on some surfaces. Until the preview has prepared the surface
  // they all show; after it, one that cannot change this surface is left out.
  const ring = !flat || flat.some((p) => p.topology === 'seam')
  const showSeamFit = !single && ring
  const showLevelRows = ring
  const showJoinEdges = !flat || flat.length > 1
  const showPerSurface = tl.joinEdges !== false && tl.margin > 0 && (!flat || flat.some((p) => p.foldEdges.length > 0))
  const defaults = useStore.getInitialState().tileLayout
  const advancedChanges = [
    tl.fit !== defaults.fit && `Layout: ${tl.fit === 'single' ? 'single copy' : 'repeat'}`,
    showSeamFit && tl.fitSeam !== defaults.fitSeam && 'Seam fitting off',
    showLevelRows && tl.levelRows === false && 'Level rows off',
    showJoinEdges && tl.joinEdges === false && 'Separate faces',
    showPerSurface && tl.marginPerSurface !== defaults.marginPerSurface && 'Margin on each surface',
    tl.minScale !== defaults.minScale && `Size cutoff ${Math.round(tl.minScale * 100)}%`,
    tl.detail !== defaults.detail && `Detail ${tl.detail} mm`,
    tl.minIslandVolume !== defaults.minIslandVolume && `Island cutoff ${tl.minIslandVolume} mm³`,
  ].filter(Boolean)
  const previewStatus = previewError || (preparing ? 'Preparing preview…' : !tile ? 'Choose a pattern on the Pattern screen.'
    : !region?.length ? 'Load a model and choose a surface.'
    : !surfaceReady ? (hasPreviewed ? 'Surface changed. Update the preview before applying.' : 'Preview the pattern on your selected surface before applying.')
    : renderedInput !== layoutInput ? 'Updating preview…'
    : previewReady ? 'Preview ready. Placement changes update automatically.'
    : 'No pattern fits this surface. Adjust the size or edge margin.')

  return (
    <div className="section placement-panel">
      <h3>Pattern placement</h3>
      <div className="muted" style={{ marginBottom: 8 }}>
        {tile ? `${tileName} · ${tile.width.toFixed(0)} × ${tile.height.toFixed(0)} mm` : 'No pattern selected'}
      </div>
      {methodPicker}
      {tileDef.connectMaterial && <div className="muted">Ribs connect across both repeat directions. Inspect the 3D result at cropped edges and small scales.</div>}
      <div className="row wrap placement-actions">
        <button className={previewReady ? 'small' : 'primary'} disabled={!region?.length || !!busy || !tile} onClick={() => flatten()}>
          {hasPreviewed ? 'Update preview' : 'Preview on model'}
        </button>
        <button className="primary" disabled={!previewReady || !!busy} onClick={apply}>Apply</button>
        {busy && <button onClick={() => { geomClient().restart(); st().setBusy(null); st().pushLog('cancelled') }}>Cancel</button>}
      </div>
      <div className={previewError ? 'danger placement-status' : 'muted placement-status'} role="status">{previewStatus}</div>
      <fieldset className="placement-controls" disabled={!!busy}>
        <div className="placement-group">
          <h4>Placement</h4>
          <div className="row wrap">
            <button className={'small' + (pickMode === 'move' ? ' active' : '')} aria-pressed={pickMode === 'move'} disabled={!previewReady && pickMode !== 'move'} onClick={() => setPickMode(pickMode === 'move' ? 'region' : 'move')}>
              {pickMode === 'move' ? 'Done moving' : 'Drag on model'}
            </button>
            <button className="small" disabled={!off[0] && !off[1]} onClick={() => set({ offset: [0, 0] })}>Reset position</button>
          </div>
          {pickMode === 'move' && <div className="muted">Drag the pattern on the selected surface. Choose Done moving to select faces again.</div>}
          <div className="row"><label htmlFor="placement-size">Size (%)</label><input id="placement-size" type="number" step={5} min={10} value={Math.round(tl.scale * 100)} onChange={(e) => set({ scale: Math.max(0.1, Number(e.target.value) / 100) })} /></div>
          <div className="row"><label htmlFor="placement-rotation">Rotation (°)</label><input id="placement-rotation" type="number" min={-180} max={180} step={1} value={tl.rotationDeg} onChange={(e) => set({ rotationDeg: Number(e.target.value) })} /></div>
          <div className="row"><label htmlFor="placement-along">Position along (mm)</label><input id="placement-along" type="number" step={0.1} value={off[0]} onChange={(e) => set({ offset: [Number(e.target.value), off[1]] })} /></div>
          <div className="row"><label htmlFor="placement-up">Position up (mm)</label><input id="placement-up" type="number" step={0.1} value={off[1]} onChange={(e) => set({ offset: [off[0], Number(e.target.value)] })} /></div>
          <div className="row"><label htmlFor="placement-margin">Solid edge margin (mm)</label><input id="placement-margin" type="number" step={0.5} min={0} value={tl.margin} onChange={(e) => set({ margin: Number(e.target.value) })} /></div>
        </div>
        <div className="placement-group">
          <h4>Operation</h4>
          <div className="row">
            <label htmlFor="placement-operation">Operation</label>
            <select id="placement-operation" value={tl.mode} onChange={(e) => set({ mode: e.target.value as typeof tl.mode })}>
              <option value="cut">Through-cut</option><option value="recess">Recess</option><option value="emboss">Emboss</option>
            </select>
          </div>
          {tl.mode === 'cut'
            ? <div className="row"><label htmlFor="placement-thickness">Wall thickness (mm)</label><input id="placement-thickness" type="number" step={0.1} min={0.1} value={tl.wallThickness} onChange={(e) => set({ wallThickness: Number(e.target.value) })} /></div>
            : <div className="row"><label htmlFor="placement-depth">{tl.mode === 'recess' ? 'Depth (mm)' : 'Height (mm)'}</label><input id="placement-depth" type="number" step={0.1} min={0.1} value={tl.depth} onChange={(e) => set({ depth: Number(e.target.value) })} /></div>}
        </div>
        <details className="placement-advanced">
          <summary>Advanced <span className="muted">{advancedChanges.length ? `· ${advancedChanges.length} changed` : '· defaults'}</span></summary>
          <div className="row">
            <label htmlFor="placement-layout">Layout</label>
            <select id="placement-layout" value={tl.fit} onChange={(e) => set({ fit: e.target.value as typeof tl.fit })}>
              <option value="auto">Auto ({single ? 'single copy' : 'repeat'})</option><option value="repeat">Repeat tile</option><option value="single">Single copy, fitted</option>
            </select>
          </div>
          {showSeamFit && <div className="row"><label htmlFor="placement-seam">Fit whole repeats around seam</label><input id="placement-seam" type="checkbox" checked={tl.fitSeam} onChange={(e) => set({ fitSeam: e.target.checked })} /></div>}
          {showLevelRows && <div className="row" title="Keep rows level with the rim of a bowl or vase. Update the preview after changing this setting.">
            <label htmlFor="level-rows">Keep rows level around walls</label><input id="level-rows" type="checkbox" checked={tl.levelRows !== false} onChange={(e) => set({ levelRows: e.target.checked })} />
          </div>}
          {showJoinEdges && <div className="row" title="Continue the pattern across adjoining faces. Update the preview after changing this setting.">
            <label htmlFor="placement-edges">Continue across sharp edges</label><input id="placement-edges" type="checkbox" checked={tl.joinEdges !== false} onChange={(e) => set({ joinEdges: e.target.checked })} />
          </div>}
          {showPerSurface && <div className="row"><label htmlFor="margin-per-surface">Solid edge margin on each surface</label><input id="margin-per-surface" type="checkbox" checked={tl.marginPerSurface} onChange={(e) => set({ marginPerSurface: e.target.checked })} /></div>}
          <div className="row" title="Leave the surface solid where curvature shrinks the pattern below this size."><label htmlFor="placement-cutoff">Minimum local size (%)</label><input id="placement-cutoff" type="number" step={5} min={0} max={95} value={Math.round(tl.minScale * 100)} onChange={(e) => set({ minScale: Number(e.target.value) / 100 })} /></div>
          <div className="row" title="Smaller values follow tight curves more closely and make larger files."><label htmlFor="placement-detail">Mesh detail (mm)</label><input id="placement-detail" type="number" step={0.5} min={0.5} max={5} value={tl.detail} onChange={(e) => set({ detail: Number(e.target.value) })} /></div>
          <div className="row"><label htmlFor="placement-islands">Drop islands under (mm³)</label><input id="placement-islands" type="number" step={1} min={0} value={tl.minIslandVolume} onChange={(e) => set({ minIslandVolume: Number(e.target.value) })} /></div>
          <button className={'small' + (pickMode === 'origin' ? ' active' : '')} aria-pressed={pickMode === 'origin'} disabled={!surfaceReady} onClick={() => setPickMode(pickMode === 'origin' ? 'region' : 'origin')}>
            {pickMode === 'origin' ? 'Cancel origin selection' : 'Choose placement origin'}
          </button>
          {pickMode === 'origin' && <div className="muted">Click a point on the selected body to set the placement origin.</div>}
          {surfaceReady && flat && <div className="muted">{topologyNote(flat)}</div>}
        </details>
        {advancedChanges.length > 0 && <div className="muted placement-summary">{advancedChanges.join(' · ')}</div>}
      </fieldset>
      {surfaceReady && info.map((l, i) => <div key={i} className="muted">{l}</div>)}
    </div>
  )
}
