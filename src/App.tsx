import { useEffect } from 'react'
import { useStore } from './state/store'
import ApplyScreen from './app/ApplyScreen'
import PatternScreen from './app/PatternScreen'
import { useTileRegen } from './app/useTileRegen'
import { useIsMobile } from './app/useIsMobile'
import { usePwa } from './app/usePwa'

export default function App() {
  useTileRegen()
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const busy = useStore((s) => s.busy)
  const mobile = useIsMobile()
  const pwa = usePwa()

  // the Apply screen needs a pointer and a 3D viewport; a phone only gets Pattern
  useEffect(() => { if (mobile && screen !== 'pattern') setScreen('pattern') }, [mobile, screen, setScreen])

  return (
    <div className={'app' + (mobile ? ' mobile' : '')}>
      <div className="topbar">
        <span className="title">{mobile ? 'Patterns' : 'STL patterns'}</span>
        {!mobile && (
          <div className="tabs">
            <button className={screen === 'pattern' ? 'active' : ''} onClick={() => setScreen('pattern')}>1 · Pattern</button>
            <button className={screen === 'apply' ? 'active' : ''} onClick={() => setScreen('apply')}>2 · Apply</button>
          </div>
        )}
        <span className="spacer" />
        {busy && <span className="busy">⏳ {busy}</span>}
        {pwa.updateReady && <button className="small primary" onClick={pwa.applyUpdate}>Update</button>}
        {!pwa.updateReady && pwa.canInstall && <button className="small" onClick={pwa.install}>Install</button>}
      </div>
      {!mobile && (
        <div style={{ display: screen === 'apply' ? 'contents' : 'none' }}>
          <ApplyScreen />
        </div>
      )}
      {(mobile || screen === 'pattern') && <PatternScreen />}
    </div>
  )
}
