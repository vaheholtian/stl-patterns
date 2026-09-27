/**
 * What the pattern browser remembers for this person: favourite cards and the
 * cards chosen most recently. A versioned record of its own, apart from saved
 * designs, so a malformed or missing one costs nothing but the favourites.
 */
import { create } from 'zustand'

export const PREFS_KEY = 'stl-patterns.browser.v1'
export const RECENT_LIMIT = 20

export interface BrowserPrefs {
  v: 1
  favorites: string[]
  recent: string[]
}

const EMPTY: BrowserPrefs = { v: 1, favorites: [], recent: [] }

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

function storage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

const ids = (x: unknown): string[] => Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []

/** Never throws: a broken record reads as empty and is overwritten on the next change. */
export function readPrefs(store: StorageLike | null = storage()): BrowserPrefs {
  try {
    const raw = store?.getItem(PREFS_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<BrowserPrefs> | null
    if (!parsed || typeof parsed !== 'object') return EMPTY
    return { v: 1, favorites: ids(parsed.favorites), recent: ids(parsed.recent).slice(0, RECENT_LIMIT) }
  } catch {
    return EMPTY
  }
}

export function writePrefs(prefs: BrowserPrefs, store: StorageLike | null = storage()): void {
  try { store?.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* storage unavailable */ }
}

export function withFavorite(prefs: BrowserPrefs, id: string, on: boolean): BrowserPrefs {
  const rest = prefs.favorites.filter((f) => f !== id)
  return { ...prefs, favorites: on ? [...rest, id] : rest }
}

export function withRecent(prefs: BrowserPrefs, id: string): BrowserPrefs {
  return { ...prefs, recent: [id, ...prefs.recent.filter((r) => r !== id)].slice(0, RECENT_LIMIT) }
}

interface PrefsState extends BrowserPrefs {
  toggleFavorite: (id: string) => void
  noteRecent: (id: string) => void
}

export const useBrowserPrefs = create<PrefsState>((set, get) => ({
  ...readPrefs(),
  toggleFavorite: (id) => {
    const next = withFavorite(get(), id, !get().favorites.includes(id))
    writePrefs(next)
    set(next)
  },
  noteRecent: (id) => {
    const next = withRecent(get(), id)
    writePrefs(next)
    set(next)
  },
}))
