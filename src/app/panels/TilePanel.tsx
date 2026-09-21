import { useNotifications } from '../../state/notifications'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { useStore } from '../../state/store'
import { useTileStore, resolveDef } from '../../state/tileStore'
import { geomClient } from '../../worker/client'
import { PreviewClient } from '../../worker/preview-client'
import { regionCentroid, isBackSide, type FlattenedPiece } from '../../geom/regionFlatten'
import { buildParameterization, fittedTileSize, polygonsToSurfaceSegments, toolMitres, type LayoutResult } from '../../geom/layout'
import { getScene } from '../../viewer/sceneRef'
import type { Pt } from '../../patterns/types'
import { generatorById, isSeamless } from '../../patterns'
import { toolOffsetRange } from '../../geom/tileTool'

interface Props {
  region: Uint32Array | null
}

export default function TilePanel({ region }: Props) {
  const tl = useStore((s) => s.tileLayout)
  const set = useStore((s) => s.setTileLayout)
  const pickMode = useStore((s) => s.pickMode)
  const setPickMode = useStore((s) => s.setPickMode)
  const busy = useStore((s) => s.busy)
  const activeBodyId = useStore((s) => s.activeBodyId)
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
  const [flatKey, setFlatKey] = useState<string>('')
  const [layout, setLayout] = useState<LayoutResult[] | null>(null)
  const [info, setInfo] = useState<string[]>([])
  const regionKey = region ? `${activeBodyId}:${region.length}:${region[0]}:${region[region.length - 1]}` : ''

  // the flattening is invalid when the region or body changes
  useEffect(() => {
    if (flatKey && flatKey.split('|')[0] !== regionKey) { setFlat(null); setLayout(null); getScene()?.setOverlayLines(null) }
  }, [regionKey, flatKey])

  const flatten = async (originOverride?: [number, number, number]) => {
    const s = st()
    const body = s.bodies.find((b) => b.id === s.activeBodyId)
    if (!body || !region) return
    const origin = originOverride ?? tl.origin ?? regionCentroid(body.mesh, region)
    if (!tl.origin) set({ origin })
    s.setBusy('flattening region')
    try {
      const res = await geomClient().flattenPieces(body.mesh, region, origin, s.segmentAngle, s.tileLayout.joinEdges !== false, (p) => st().setBusy(p))
      if (!res.pieces.length) throw new Error('no piece of the region could be flattened')
      setFlat(res.pieces)
      setFlatKey(`${regionKey}|${res.pieces.length}`)
      st().pushLog(res.log)
    } catch (e) {
      st().pushLog(`flatten failed: ${(e as Error).message}`)
    } finally {
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
    getScene()?.setOverlayLines(new Float32Array())
    if (!flat || !tile || !tl.origin) return
    let cancelled = false
    if (layoutTimer.current) clearTimeout(layoutTimer.current)
    layoutTimer.current = window.setTimeout(async () => {
      try {
        const base = {
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
            const key = JSON.stringify([tileDef.generatorId, resolved.params, tileDef.invert, tileDef.connectMaterial, tileDef.seamless, resolved.mirror, tw, th, lineWidth, tileDef.svgTile ? tileDef.svgTile.polygons.length : 0])
            const cached = singleCache.current.get(key)
            if (cached) {
              polys = cached.polys; tw = cached.tw; th = cached.th
            } else {
              const generated = await previewClient.generate({ def: tileDef, lineWidth, size: { width: tw, height: th } })
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
        useNotifications.getState().show('layout', 'Tile layout', [`Layout failed: ${(e as Error).message}`], 'error')
        setLayout(null)
      }
    }, 60)
    return () => { cancelled = true; if (layoutTimer.current) clearTimeout(layoutTimer.current); previewClient.cancel() }
  }, [previewClient, flat, tile, tilePolys, tileDef, resolved, gen, single, lineWidth, tl.origin, tl.rotationDeg, tl.scale, tl.margin, tl.marginPerSurface, tl.fitSeam, tl.minScale, tl.mode, tl.wallThickness, tl.depth])

  // when the origin is picked, the pieces that centre on it (and any far-side cap) move: re-flatten
  const lastOrigin = useRef<string>('')
  useEffect(() => {
    if (!tl.origin) return
    const k = tl.origin.join(',')
    if (lastOrigin.current && lastOrigin.current !== k && flat && (flat.length > 1 || flat[0].topology === 'cap')) flatten(tl.origin)
    lastOrigin.current = k
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.origin])

  const apply = async () => {
    const s = st()
    const body = s.bodies.find((b) => b.id === s.activeBodyId)
    if (!body || !layout || !flat) return
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

  return (
    <div className="section">
      <h3>Tile from Pattern screen</h3>
      <div className="muted" style={{ marginBottom: 6 }}>
        {tile ? `${tileName}: ${tile.width.toFixed(0)} × ${tile.height.toFixed(0)} mm, ${tilePolys.length} shapes` : 'No tile yet. Make one on the Pattern screen.'}
      </div>
      {tileDef.connectMaterial && <div className="muted">Ribs connect across both repeat directions. Inspect the 3D result at cropped edges and small scales.</div>}
      <div className="row wrap">
        <button className="small" disabled={!region || !!busy || !tile} onClick={() => flatten()}>{flat ? 'Re-flatten' : '1. Flatten region'}</button>
        <button className={'small' + (pickMode === 'origin' ? ' active' : '')} disabled={!flat} onClick={() => setPickMode(pickMode === 'origin' ? 'region' : 'origin')}>
          {pickMode === 'origin' ? 'Click the surface…' : '2. Place origin'}
        </button>
      </div>
      {flat && <div className="muted">{topologyNote(flat)}</div>}
      <div className="field">
        <label>Rotation {tl.rotationDeg}°</label>
        <input type="range" min={-180} max={180} step={1} value={tl.rotationDeg} onChange={(e) => set({ rotationDeg: Number(e.target.value) })} />
      </div>
      <div className="row"><label>Scale</label><input type="number" step={0.05} min={0.1} value={tl.scale} onChange={(e) => set({ scale: Number(e.target.value) })} /></div>
      <div className="row"><label>Solid edge margin (mm)</label><input type="number" step={0.5} min={0} value={tl.margin} onChange={(e) => set({ margin: Number(e.target.value) })} /></div>
      <div className="row" title="repeat the tile, or generate the pattern once at the size of the whole region (no internal joins)">
        <label>Layout</label>
        <select value={tl.fit} onChange={(e) => set({ fit: e.target.value as typeof tl.fit })}>
          <option value="auto">Auto ({single ? 'single copy' : 'repeat'})</option>
          <option value="repeat">Repeat tile</option>
          <option value="single">Single copy, fitted</option>
        </select>
      </div>
      {!single && <div className="row"><label>Fit whole repeats around seam</label><input type="checkbox" checked={tl.fitSeam} onChange={(e) => set({ fitSeam: e.target.checked })} /></div>}
      <div className="row" title="unfold faces that meet at a sharp edge like the net of a box, so the pattern continues across the edge instead of restarting on each face; off keeps a solid margin along every edge">
        <label>Continue across sharp edges</label>
        <input type="checkbox" checked={tl.joinEdges !== false} onChange={(e) => set({ joinEdges: e.target.checked })} />
      </div>
      {tl.joinEdges !== false && tl.margin > 0 && (
        <div className="row" title="apply the solid edge margin to every face, including the sharp edges the faces were unfolded across, so a box comes out with solid corners. The pattern still repeats in phase around the part, unlike turning off Continue across sharp edges, which restarts it on each face.">
          <label htmlFor="margin-per-surface">Solid edge margin on each surface</label>
          <input id="margin-per-surface" type="checkbox" checked={tl.marginPerSurface} onChange={(e) => set({ marginPerSurface: e.target.checked })} />
        </div>
      )}
      <div className="row" title="on curved surfaces the tile shrinks away from the origin; below this size the surface is left solid"><label>Skip where smaller than</label><input type="number" step={5} min={0} max={95} value={Math.round(tl.minScale * 100)} onChange={(e) => set({ minScale: Number(e.target.value) / 100 })} /></div>
      <div className="row" title="max edge length of the tool mesh, mm; smaller follows tight curves better but makes bigger files"><label>Detail (mm)</label><input type="number" step={0.5} min={0.5} max={5} value={tl.detail} onChange={(e) => set({ detail: Number(e.target.value) })} /></div>
      <div className="row">
        <label>Mode</label>
        <select value={tl.mode} onChange={(e) => set({ mode: e.target.value as typeof tl.mode })}>
          <option value="cut">Through-cut</option>
          <option value="recess">Recess</option>
          <option value="emboss">Emboss</option>
        </select>
      </div>
      {tl.mode === 'cut'
        ? <div className="row"><label>Wall thickness (mm)</label><input type="number" step={0.1} min={0.1} value={tl.wallThickness} onChange={(e) => set({ wallThickness: Number(e.target.value) })} /></div>
        : <div className="row"><label>{tl.mode === 'recess' ? 'Depth (mm)' : 'Height (mm)'}</label><input type="number" step={0.1} min={0.1} value={tl.depth} onChange={(e) => set({ depth: Number(e.target.value) })} /></div>}
      <div className="row"><label>Drop islands under (mm³)</label><input type="number" step={1} min={0} value={tl.minIslandVolume} onChange={(e) => set({ minIslandVolume: Number(e.target.value) })} /></div>
      {info.map((l, i) => <div key={i} className="muted">{l}</div>)}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" disabled={!layout || !!busy} onClick={apply}>3. Apply tile</button>
        {busy && <button onClick={() => { geomClient().restart(); st().setBusy(null); st().pushLog('cancelled') }}>Cancel</button>}
      </div>
    </div>
  )
}
