import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  catalog, catalogEntry, filterCatalog, cutState, CUT_STATE_LABEL, START_HERE,
  type CatalogEntry, type CatalogVariant, type CatalogFilters,
} from '../patterns/catalog'
import { FAMILIES, type Family, type Layout } from '../patterns/catalogTypes'
import { useBrowserPrefs } from '../state/browserPrefs'
import type { SavedTile } from '../state/tileStore'
import { LibrarySwatch } from './LibrarySwatch'
import { useSavedThumbs } from './useSavedThumbs'
import { CUT_REFERENCE_NOTE } from './browserShared'
import { NativeThumb } from './NativeThumb'

type Collection = 'start' | 'all' | 'favorites' | 'recent' | 'mine'

const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'start', label: 'Start here' },
  { id: 'all', label: 'All patterns' },
  { id: 'favorites', label: 'Favourites' },
  { id: 'recent', label: 'Recent' },
  { id: 'mine', label: 'My designs' },
]

const LAYOUT_LABEL: Record<Layout, string> = { field: 'Surface repeat', band: 'Band', motif: 'Motif' }

/** The picture on a card: prebuilt markup for a native variant, a live swatch for a library design. */
export function CardThumb({ entry, variant, className = 'pb-thumb' }: { entry: CatalogEntry; variant: CatalogVariant; className?: string }) {
  if (entry.library) return <LibrarySwatch p={entry.library} className={className} />
  return <NativeThumb variantId={variant.id} className={className} />
}

export function CutBadge({ variant, muted, className = '' }: { variant: CatalogVariant; muted?: boolean; className?: string }) {
  const state = muted ? 'unmeasured' : cutState(variant.cut)
  const label = muted ? 'Reference no longer applies' : CUT_STATE_LABEL[state]
  return <em className={`pb-cut ${state} ${className}`} title={CUT_REFERENCE_NOTE}>{label}</em>
}

function Card({ entry, selected, favorite, onChoose, onFavorite }: {
  entry: CatalogEntry; selected: boolean; favorite: boolean
  onChoose: (entry: CatalogEntry, variant: CatalogVariant) => void; onFavorite: (id: string) => void
}) {
  const v = entry.variants[0]
  const layouts = [...new Set(entry.variants.map((x) => x.layout))]
  return (
    <div className={`pb-card${selected ? ' selected' : ''}`}>
      <button type="button" className="pb-pick" onClick={() => onChoose(entry, v)} aria-label={`Choose ${entry.title}`} aria-current={selected ? 'true' : undefined}>
        <CardThumb entry={entry} variant={v} />
        <span className="pb-title">{entry.title}</span>
        <span className="pb-meta">
          <CutBadge variant={v} />
          {entry.variants.length > 1 && <em>{entry.variants.length} variants</em>}
          {entry.surface && <em title="Lay it out as a repeating tile, or generate cells over the selected surface on the Apply screen">Tile or on surface</em>}
          {!layouts.includes('field') && <em>{LAYOUT_LABEL[layouts[0]]}</em>}
        </span>
      </button>
      <button
        type="button"
        className={`pb-fav${favorite ? ' on' : ''}`}
        aria-pressed={favorite}
        aria-label={favorite ? `Remove ${entry.title} from favourites` : `Add ${entry.title} to favourites`}
        onClick={() => onFavorite(entry.id)}
      >{favorite ? '★' : '☆'}</button>
    </div>
  )
}

function SavedCard({ s, thumb, onLoad, onRemove }: { s: SavedTile; thumb: string | undefined; onLoad: () => void; onRemove: () => void }) {
  const kind = s.generatorId === 'svg' ? 'imported SVG' : s.generatorId === 'library' ? String(s.params.pattern ?? 'library') : s.generatorId
  return (
    <div className="pb-card">
      <button type="button" className="pb-pick" onClick={onLoad} aria-label={`Load ${s.name}`}>
        {thumb ? <span className="pb-thumb" dangerouslySetInnerHTML={{ __html: thumb }} />
          : <span className={`pb-thumb pb-placeholder${thumb === '' ? ' failed' : ''}`}>{thumb === '' ? 'no preview' : '…'}</span>}
        <span className="pb-title">{s.name || 'untitled'}</span>
        <span className="pb-meta"><em>{kind}</em></span>
      </button>
      <button type="button" className="pb-fav" aria-label={`Delete ${s.name}`} title="Delete this design" onClick={onRemove}>✕</button>
    </div>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  /** the card the current tile came from, if any */
  currentId?: string
  onChoose: (entry: CatalogEntry, variant: CatalogVariant) => void
  saved: SavedTile[]
  onLoadSaved: (id: string) => void
  onRemoveSaved: (id: string) => void
}

/**
 * One browser over every built-in pattern and the saved designs. Its state
 * (collection, family, search, filters) lives here and survives closing, so
 * the browser reopens where it was left as long as the screen stays mounted.
 */
export function PatternBrowser({ open, onClose, currentId, onChoose, saved, onLoadSaved, onRemoveSaved }: Props) {
  const [collection, setCollection] = useState<Collection>('start')
  const [family, setFamily] = useState<Family | null>(null)
  const [shape, setShape] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState<Layout | null>(null)
  const [seamlessOnly, setSeamlessOnly] = useState(false)
  const [holdsOnly, setHoldsOnly] = useState(false)
  // display only: swaps black and white on every card so both sides of a design can be judged
  const [invertPreview, setInvertPreview] = useState(false)
  const favorites = useBrowserPrefs((s) => s.favorites)
  const recent = useBrowserPrefs((s) => s.recent)
  const toggleFavorite = useBrowserPrefs((s) => s.toggleFavorite)
  const noteRecent = useBrowserPrefs((s) => s.noteRecent)
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const opener = useRef<Element | null>(null)
  const thumbs = useSavedThumbs(saved, open && collection === 'mine')

  // focus the search on open, and hand focus back to whatever opened us on close
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement
      searchRef.current?.focus()
    } else if (opener.current instanceof HTMLElement) {
      // after the closing render has painted, and without scrolling the editor
      const target = opener.current
      opener.current = null
      requestAnimationFrame(() => target.focus({ preventScroll: true }))
    }
  }, [open])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    if (!focusable.length) return
    const first = focusable[0], last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const familyInfo = FAMILIES.find((f) => f.id === family)
  const filters: CatalogFilters = { query, family, shape: familyInfo?.chips ? shape : null, layout, seamlessOnly, holdsOnly }
  // 352 cards filter in well under a millisecond, so there is nothing to memoise
  const pool = collection === 'start' ? START_HERE.map(catalogEntry).filter((e): e is CatalogEntry => Boolean(e))
    : collection === 'favorites' ? favorites.map(catalogEntry).filter((e): e is CatalogEntry => Boolean(e))
    : collection === 'recent' ? recent.map(catalogEntry).filter((e): e is CatalogEntry => Boolean(e))
    : catalog
  const shown = filterCatalog(pool, filters)
  const shownSaved = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return saved.filter((s) => words.every((w) => `${s.name} ${s.generatorId} ${String(s.params.pattern ?? '')}`.toLowerCase().includes(w)))
  }, [saved, query])

  if (!open) return null

  const choose = (entry: CatalogEntry, variant: CatalogVariant) => {
    noteRecent(entry.id)
    onChoose(entry, variant)
    onClose()
  }
  const pickFamily = (f: Family | null) => { setFamily(f); setShape(null) }
  const filtersOn = Boolean(family || query || layout || seamlessOnly || holdsOnly)
  const emptyText = collection === 'mine'
    ? (saved.length ? `No saved design matches “${query}”.` : 'No saved designs yet. Save design keeps the current pattern and its settings here.')
    : collection === 'favorites' && !favorites.length ? 'No favourites yet. Tap ☆ on a card to keep it here.'
    : collection === 'recent' && !recent.length ? 'Nothing chosen yet.'
    : `Nothing matches${query ? ` “${query}”` : ''}${familyInfo ? ` in ${familyInfo.label}` : ''}${holdsOnly || seamlessOnly || layout ? ' with these filters' : ''}.`

  return (
    <div className="pb-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pb-dialog" role="dialog" aria-modal="true" aria-label="Choose a pattern" ref={dialogRef} onKeyDown={onKeyDown}>
        <div className="pb-head">
          <input
            ref={searchRef}
            type="search"
            placeholder={collection === 'mine' ? 'Search your designs…' : `Search ${catalog.length} patterns by name, look or tag…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search patterns"
          />
          <label className="pb-toggle" title="Show every preview with solid and openings swapped. Display only: the pattern you choose keeps its own setting.">
            <input type="checkbox" checked={invertPreview} onChange={(e) => setInvertPreview(e.target.checked)} />
            Invert preview
          </label>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="pb-collections" role="tablist" aria-label="Collections">
          {COLLECTIONS.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={collection === c.id} className={collection === c.id ? 'active' : ''} onClick={() => setCollection(c.id)}>
              {c.label}{c.id === 'favorites' && favorites.length ? ` (${favorites.length})` : c.id === 'mine' && saved.length ? ` (${saved.length})` : ''}
            </button>
          ))}
        </div>

        {collection !== 'mine' && (
          <>
            <div className="pb-families" aria-label="Family">
              <button type="button" className={family === null ? 'active' : ''} onClick={() => pickFamily(null)}>All</button>
              {FAMILIES.map((f) => (
                <button key={f.id} type="button" className={family === f.id ? 'active' : ''} title={f.blurb} onClick={() => pickFamily(family === f.id ? null : f.id)}>{f.label}</button>
              ))}
            </div>
            {familyInfo?.chips && (
              <div className="pb-chips" aria-label={`${familyInfo.label} shapes`}>
                {familyInfo.chips.map((c) => (
                  <button key={c.id} type="button" className={shape === c.id ? 'active' : ''} onClick={() => setShape(shape === c.id ? null : c.id)}>{c.label}</button>
                ))}
              </div>
            )}
            <div className="pb-filters">
              <label className="pb-toggle">
                Layout
                <select value={layout ?? ''} onChange={(e) => setLayout((e.target.value || null) as Layout | null)} aria-label="Layout">
                  <option value="">Any</option>
                  <option value="field">Surface repeat</option>
                  <option value="band">Band</option>
                  <option value="motif">Motif</option>
                </select>
              </label>
              <label className="pb-toggle" title="Only patterns that repeat without being mirrored, and library designs that lose nothing where copies meet">
                <input type="checkbox" checked={seamlessOnly} onChange={(e) => setSeamlessOnly(e.target.checked)} />
                Seamless
              </label>
              <label className="pb-toggle" title={CUT_REFERENCE_NOTE}>
                <input type="checkbox" checked={holdsOnly} onChange={(e) => setHoldsOnly(e.target.checked)} />
                Holds together at reference settings
              </label>
            </div>
          </>
        )}

        <div className={`pb-grid${invertPreview ? ' inverted' : ''}`} role="list">
          {collection === 'mine'
            ? shownSaved.map((s) => (
              <SavedCard key={s.id} s={s} thumb={thumbs.get(s.id)} onLoad={() => { onLoadSaved(s.id); onClose() }} onRemove={() => onRemoveSaved(s.id)} />
            ))
            : shown.map((e) => (
              <Card key={e.id} entry={e} selected={e.id === currentId} favorite={favorites.includes(e.id)} onChoose={choose} onFavorite={toggleFavorite} />
            ))}
          {(collection === 'mine' ? !shownSaved.length : !shown.length) && (
            <div className="pb-empty muted">
              {emptyText}
              {collection !== 'mine' && filtersOn && <> <button type="button" className="as-link" onClick={() => { pickFamily(null); setQuery(''); setLayout(null); setSeamlessOnly(false); setHoldsOnly(false) }}>Clear filters</button></>}
            </div>
          )}
        </div>

        <div className="pb-foot muted">
          {collection === 'mine'
            ? `${shownSaved.length} of ${saved.length} saved designs.`
            : `${shown.length} of ${catalog.length} patterns. Cut badges are reference measurements at default settings. Library designs from pattern.monster, MIT licensed.`}
        </div>
      </div>
    </div>
  )
}
