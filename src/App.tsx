import { useStore } from './state/store'
import ApplyScreen from './app/ApplyScreen'
import PatternScreen from './app/PatternScreen'

export default function App() {
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const busy = useStore((s) => s.busy)
  return (
    <div className="app">
      <div className="topbar">
        <span className="title">STL patterns</span>
        <div className="tabs">
          <button className={screen === 'pattern' ? 'active' : ''} onClick={() => setScreen('pattern')}>1 · Pattern</button>
          <button className={screen === 'apply' ? 'active' : ''} onClick={() => setScreen('apply')}>2 · Apply</button>
        </div>
        <span className="spacer" />
        {busy && <span className="busy">⏳ {busy}</span>}
      </div>
      <div style={{ display: screen === 'apply' ? 'contents' : 'none' }}>
        <ApplyScreen />
      </div>
      {screen === 'pattern' && <PatternScreen />}
    </div>
  )
}
