import type { SceneManager } from './SceneManager'

let current: SceneManager | null = null
export function setScene(sm: SceneManager | null) { current = sm }
export function getScene(): SceneManager | null { return current }
