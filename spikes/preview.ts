// Minimal three.js preview for spike pages. Throwaway.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { TriMesh } from '../src/geom/manifold'

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let mesh: THREE.Mesh | null = null

export function previewTriMesh(canvas: HTMLCanvasElement, tri: TriMesh) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(1)
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    camera = new THREE.PerspectiveCamera(40, 1, 1, 1000)
    camera.position.set(0, -110, 60)
    camera.up.set(0, 0, 1)
    camera.lookAt(0, 0, 0)
    const controls = new OrbitControls(camera, canvas)
    controls.addEventListener('change', render)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x333355, 1.2))
    const dir = new THREE.DirectionalLight(0xffffff, 1.5)
    dir.position.set(50, -80, 100)
    scene.add(dir)
  }
  if (mesh) { scene!.remove(mesh); mesh.geometry.dispose() }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(tri.positions, 3))
  g.setIndex(new THREE.BufferAttribute(tri.indices, 1))
  g.computeVertexNormals()
  mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x7fb2e5, flatShading: true, side: THREE.DoubleSide }))
  scene!.add(mesh)
  render()
}

function render() {
  if (renderer && scene && camera) renderer.render(scene, camera)
}
