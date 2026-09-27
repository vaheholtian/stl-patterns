// Favourites and recents survive broken storage and never touch saved designs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPrefs, writePrefs, withFavorite, withRecent, PREFS_KEY, RECENT_LIMIT } from '../src/state/browserPrefs.ts'

function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, map }
}

test('missing, malformed and wrongly-typed records read as empty', () => {
  assert.deepEqual(readPrefs(memory()), { v: 1, favorites: [], recent: [] })
  assert.deepEqual(readPrefs(memory({ [PREFS_KEY]: '{not json' })), { v: 1, favorites: [], recent: [] })
  assert.deepEqual(readPrefs(memory({ [PREFS_KEY]: '42' })), { v: 1, favorites: [], recent: [] })
  assert.deepEqual(readPrefs(memory({ [PREFS_KEY]: JSON.stringify({ favorites: 'x', recent: [1, 'ok', null] }) })), { v: 1, favorites: [], recent: ['ok'] })
  assert.deepEqual(readPrefs(null), { v: 1, favorites: [], recent: [] })
})

test('a storage that throws costs nothing', () => {
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.deepEqual(readPrefs(broken), { v: 1, favorites: [], recent: [] })
  assert.doesNotThrow(() => writePrefs({ v: 1, favorites: ['a'], recent: [] }, broken))
})

test('favourites toggle and recents keep the newest first, without duplicates, up to the limit', () => {
  let p = readPrefs(memory())
  p = withFavorite(p, 'a', true); p = withFavorite(p, 'b', true); p = withFavorite(p, 'a', true)
  assert.deepEqual(p.favorites, ['b', 'a'])
  p = withFavorite(p, 'a', false)
  assert.deepEqual(p.favorites, ['b'])
  for (let i = 0; i < RECENT_LIMIT + 5; i++) p = withRecent(p, `r${i}`)
  p = withRecent(p, 'r3')
  assert.equal(p.recent.length, RECENT_LIMIT)
  assert.equal(p.recent[0], 'r3')
  assert.equal(p.recent.filter((r) => r === 'r3').length, 1)
  const store = memory()
  writePrefs(p, store)
  assert.deepEqual(readPrefs(store), p)
  assert.equal(store.map.size, 1, 'only the prefs record is written')
})
