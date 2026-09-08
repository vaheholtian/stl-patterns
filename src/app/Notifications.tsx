import { useEffect } from 'react'
import { useStore } from '../state/store'
import { useTileStore } from '../state/tileStore'
import { useNotifications } from '../state/notifications'
import { geomClient } from '../worker/client'

export default function Notifications() {
  const busy = useStore(s => s.busy)
  const progress = useStore(s => s.progress)
  const warnings = useTileStore(s => s.warnings)
  const tile = useTileStore(s => s.tile)
  const notices = useNotifications(s => s.notices)
  const dismiss = useNotifications(s => s.dismiss)
  const generating = warnings.some(w => w.startsWith('Generating pattern'))
  useEffect(() => {
    const lines = warnings.filter(w => !w.startsWith('Generating pattern'))
    const tone = lines.some(w => /failed|exceeded/i.test(w)) ? 'error'
      : lines.some(w => !tile?.notes?.includes(w) && !w.startsWith('Kept material:')) ? 'warning' : 'info'
    useNotifications.getState().show('pattern', 'Pattern', lines, tone)
  }, [warnings, tile])
  useEffect(() => useStore.subscribe((state, previous) => {
    if (state.log === previous.log || !state.log.length) return
    const lines = state.log.length > previous.log.length ? state.log.slice(previous.log.length) : state.log.slice(-1)
    useNotifications.getState().show('operation', 'Activity', lines, lines.some(l => /failed|not watertight/i.test(l)) ? 'error' : 'info')
  }), [])
  if (!busy && !generating && !notices.length) return null
  const tiled = busy?.startsWith('tile:')
  return <aside className="notifications" aria-label="Status and notifications">
    {(busy || generating) && <section className="notice progress-notice" role="status" aria-live="polite">
      <div className="notice-heading"><strong>{tiled ? 'Applying tiled pattern' : generating && !busy ? 'Generating pattern' : 'Working'}</strong>
        {tiled && <button className="small" onClick={() => { geomClient().restart(); useStore.getState().setBusy(null); useStore.getState().pushLog('Tiled operation cancelled') }}>Cancel</button>}
      </div>
      <div className="notice-stage">{busy?.replace(/^tile:\s*/, '') ?? 'Preparing preview'}</div>
      <progress aria-label={tiled ? 'Tiled cut stage progress' : 'Operation progress'} max={1} value={progress ?? undefined} />
      {tiled && <div className="muted">Progress follows processing stages.</div>}
    </section>}
    {notices.map(n => <section className={`notice notice-${n.tone}`} key={n.id} role={n.tone === 'error' ? 'alert' : 'status'}>
      <div className="notice-heading"><strong>{n.title}</strong><button className="notice-dismiss" aria-label={`Dismiss ${n.title} message`} onClick={() => dismiss(n.id)}>×</button></div>
      <div className="notice-lines">{n.lines.map((line, i) => <div key={i}>{line}</div>)}</div>
    </section>)}
  </aside>
}
