// Phone-sized viewport check, kept in one place so the layout switch is consistent.
// `?mobile=1` forces the phone layout and `?mobile=0` the desktop one, which is
// how the phone layout gets checked from a desktop browser.
import { useEffect, useState } from 'react'

const QUERY = '(max-width: 760px)'

function override(): boolean | null {
  if (typeof location === 'undefined') return null
  const v = new URLSearchParams(location.search).get('mobile')
  if (v === '1' || v === 'true') return true
  if (v === '0' || v === 'false') return false
  return null
}

export function useIsMobile(): boolean {
  const forced = override()
  const [is, setIs] = useState(() => forced ?? (typeof window !== 'undefined' && window.matchMedia(QUERY).matches))
  useEffect(() => {
    if (forced !== null) return
    const mq = window.matchMedia(QUERY)
    const onChange = () => setIs(mq.matches)
    mq.addEventListener('change', onChange)
    onChange()
    return () => mq.removeEventListener('change', onChange)
  }, [forced])
  return forced ?? is
}
