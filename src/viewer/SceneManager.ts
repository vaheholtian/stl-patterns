import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import type { TriMesh } from '../geom/manifold'

// accelerate raycasting on every BufferGeometry
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

const COLOR_BASE = new THREE.Color(0x8fa3b8)
const COLOR_ACTIVE = new THREE.Color(0xa9c4dd)
const COLOR_SELECTED = new THREE.Color(0xf2a33a)
const COLOR_HOVER = new THREE.Color(0xffd27f)

interface BodyEntry {
  id: number
  mesh: THREE.Mesh
  nTri: number
  colors: Float32Array
}

export interface PickResult {
  bodyId: number
  faceIndex: number
  point: THREE.Vector3
  normal: THREE.Vector3
}

/** Owns the three.js scene. React talks to it through a few imperative methods. */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  private bodies = new Map<number, BodyEntry>()
  private activeId: number | null = null
  private raycaster = new THREE.Raycaster()
  private needsRender = true
  private disposed = false
  private hoverFace: { bodyId: number; face: number } | null = null
  private markers = new THREE.Group()
  onPick: ((hit: PickResult, ev: PointerEvent) => void) | null = null
  onHover: ((hit: PickResult | null) => void) | null = null
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new THREE.Color(0x1b1e24)
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(120, -160, 100)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.addEventListener('change', () => (this.needsRender = true))
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404860, 1.0))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(80, -120, 160)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.5)
    fill.position.set(-100, 80, -40)
    this.scene.add(fill)
    const grid = new THREE.GridHelper(400, 40, 0x3a4050, 0x2a2f3a)
    grid.rotation.x = Math.PI / 2
    this.scene.add(grid)
    this.scene.add(this.markers)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointermove', this.onPointerMove)
    this.resize()
    this.loop()
  }

  private downPos: [number, number] | null = null
  private onPointerDown = (ev: PointerEvent) => { this.downPos = [ev.clientX, ev.clientY] }
  private onPointerUp = (ev: PointerEvent) => {
    if (!this.downPos) return
    const moved = Math.hypot(ev.clientX - this.downPos[0], ev.clientY - this.downPos[1])
    this.downPos = null
    if (moved > 4 || ev.button !== 0) return
    const hit = this.pick(ev)
    if (hit && this.onPick) this.onPick(hit, ev)
  }
  private onPointerMove = (ev: PointerEvent) => {
    if (!this.onHover) return
    const hit = this.pick(ev)
    this.onHover(hit)
  }

  pick(ev: PointerEvent): PickResult | null {
    const rect = this.canvas.getBoundingClientRect()
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera)
    const meshes = [...this.bodies.values()].filter((b) => b.mesh.visible).map((b) => b.mesh)
    const hits = this.raycaster.intersectObjects(meshes, false)
    if (!hits.length || hits[0].faceIndex == null) return null
    const entry = [...this.bodies.values()].find((b) => b.mesh === hits[0].object)!
    const n = hits[0].face?.normal.clone() ?? new THREE.Vector3(0, 0, 1)
    return { bodyId: entry.id, faceIndex: hits[0].faceIndex ?? 0, point: hits[0].point.clone(), normal: n }
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.needsRender = true
  }

  private loop = () => {
    if (this.disposed) return
    requestAnimationFrame(this.loop)
    this.controls.update()
    if (this.needsRender) {
      this.needsRender = false
      this.renderer.render(this.scene, this.camera)
    }
  }

  /** Replace the set of displayed bodies. Geometry is rebuilt only for changed meshes. */
  setBodies(list: { id: number; mesh: TriMesh; visible: boolean }[]) {
    const seen = new Set<number>()
    for (const b of list) {
      seen.add(b.id)
      const existing = this.bodies.get(b.id)
      if (existing && (existing.mesh.userData.src as TriMesh) === b.mesh) {
        existing.mesh.visible = b.visible
        continue
      }
      if (existing) this.removeEntry(existing)
      const entry = this.buildEntry(b.id, b.mesh)
      entry.mesh.visible = b.visible
      this.bodies.set(b.id, entry)
      this.scene.add(entry.mesh)
    }
    for (const [id, e] of this.bodies) if (!seen.has(id)) { this.removeEntry(e); this.bodies.delete(id) }
    this.needsRender = true
  }

  private removeEntry(e: BodyEntry) {
    this.scene.remove(e.mesh)
    e.mesh.geometry.disposeBoundsTree?.()
    e.mesh.geometry.dispose()
    ;(e.mesh.material as THREE.Material).dispose()
  }

  private buildEntry(id: number, tri: TriMesh): BodyEntry {
    const nTri = tri.indices.length / 3
    const pos = new Float32Array(nTri * 9)
    for (let t = 0; t < nTri; t++) {
      for (let c = 0; c < 3; c++) {
        const v = tri.indices[t * 3 + c] * 3
        pos[t * 9 + c * 3] = tri.positions[v]
        pos[t * 9 + c * 3 + 1] = tri.positions[v + 1]
        pos[t * 9 + c * 3 + 2] = tri.positions[v + 2]
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const colors = new Float32Array(nTri * 9)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    // indirect keeps triangle order intact so faceIndex maps to our triangle ids
    g.computeBoundsTree({ indirect: true })
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(g, mat)
    mesh.userData.src = tri
    const entry = { id, mesh, nTri, colors }
    this.paint(entry, null)
    return entry
  }

  setActive(id: number | null) {
    this.activeId = id
    for (const e of this.bodies.values()) this.paint(e, null)
    this.needsRender = true
  }

  /** Recolor the active body from a selection mask. */
  setSelection(mask: Uint8Array | null) {
    if (this.activeId === null) return
    const e = this.bodies.get(this.activeId)
    if (e) { this.paint(e, mask); this.needsRender = true }
  }

  private lastMask: Uint8Array | null = null
  private paint(e: BodyEntry, mask: Uint8Array | null) {
    const isActive = e.id === this.activeId
    if (isActive) this.lastMask = mask
    const base = isActive ? COLOR_ACTIVE : COLOR_BASE
    for (let t = 0; t < e.nTri; t++) {
      const c = isActive && mask && mask[t] ? COLOR_SELECTED : base
      for (let k = 0; k < 3; k++) { e.colors[t * 9 + k * 3] = c.r; e.colors[t * 9 + k * 3 + 1] = c.g; e.colors[t * 9 + k * 3 + 2] = c.b }
    }
    ;(e.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }

  /** Highlight one face briefly (hover). */
  setHover(hit: { bodyId: number; face: number } | null) {
    if (this.hoverFace && (!hit || hit.bodyId !== this.hoverFace.bodyId || hit.face !== this.hoverFace.face)) {
      const e = this.bodies.get(this.hoverFace.bodyId)
      if (e) this.paintFace(e, this.hoverFace.face, null)
    }
    this.hoverFace = hit
    if (hit) {
      const e = this.bodies.get(hit.bodyId)
      if (e) this.paintFace(e, hit.face, COLOR_HOVER)
    }
    this.needsRender = true
  }

  private paintFace(e: BodyEntry, t: number, color: THREE.Color | null) {
    const isActive = e.id === this.activeId
    const c = color ?? (isActive && this.lastMask && this.lastMask[t] ? COLOR_SELECTED : isActive ? COLOR_ACTIVE : COLOR_BASE)
    for (let k = 0; k < 3; k++) { e.colors[t * 9 + k * 3] = c.r; e.colors[t * 9 + k * 3 + 1] = c.g; e.colors[t * 9 + k * 3 + 2] = c.b }
    ;(e.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }

  /** Small sphere markers, e.g. the pattern origin. */
  setMarkers(points: { position: THREE.Vector3; color: number; radius?: number }[]) {
    this.markers.clear()
    for (const p of points) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(p.radius ?? 1.2, 16, 12), new THREE.MeshBasicMaterial({ color: p.color, depthTest: false }))
      s.position.copy(p.position)
      s.renderOrder = 10
      this.markers.add(s)
    }
    this.needsRender = true
  }

  /** Overlay line segments (pattern preview). */
  private overlay: THREE.LineSegments | null = null
  setOverlayLines(segments: Float32Array | null, color = 0xffe08a) {
    if (this.overlay) { this.scene.remove(this.overlay); this.overlay.geometry.dispose(); (this.overlay.material as THREE.Material).dispose(); this.overlay = null }
    if (segments && segments.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(segments, 3))
      this.overlay = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, depthTest: true }))
      this.overlay.renderOrder = 5
      this.scene.add(this.overlay)
    }
    this.needsRender = true
  }

  fitAll() {
    const box = new THREE.Box3()
    let any = false
    for (const e of this.bodies.values()) { if (e.mesh.visible) { box.expandByObject(e.mesh); any = true } }
    if (!any) return
    const size = box.getSize(new THREE.Vector3()).length()
    const center = box.getCenter(new THREE.Vector3())
    this.controls.target.copy(center)
    const dir = new THREE.Vector3(0.6, -0.8, 0.55).normalize()
    this.camera.position.copy(center).addScaledVector(dir, size * 1.4)
    this.camera.near = size / 100
    this.camera.far = size * 20
    this.camera.updateProjectionMatrix()
    this.controls.update()
    this.needsRender = true
  }

  requestRender() { this.needsRender = true }

  dispose() {
    this.disposed = true
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    for (const e of this.bodies.values()) this.removeEntry(e)
    this.bodies.clear()
    this.controls.dispose()
    this.renderer.dispose()
  }
}
