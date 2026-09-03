// Service worker registration, install prompt and update prompt.
import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep the prompt until the user asks for it
    deferredPrompt = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => { deferredPrompt = null; notify() })
}

/** True when the app is running from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

/** iOS has no install event: the user adds the app from the share sheet. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

let waitingWorker: ServiceWorker | null = null

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      if (reg.waiting) { waitingWorker = reg.waiting; notify() }
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing
        if (!sw) return
        sw.addEventListener('statechange', () => {
          // a worker that installs while another controls the page is an update
          if (sw.state === 'installed' && navigator.serviceWorker.controller) { waitingWorker = sw; notify() }
        })
      })
    } catch { /* offline support is optional */ }
  })
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

export interface PwaState {
  canInstall: boolean
  install: () => Promise<void>
  updateReady: boolean
  applyUpdate: () => void
  standalone: boolean
  iosHint: boolean
}

export function usePwa(): PwaState {
  const [, bump] = useState(0)
  useEffect(() => {
    const l = () => bump((n) => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  const standalone = isStandalone()
  return {
    canInstall: deferredPrompt !== null,
    install: async () => {
      const p = deferredPrompt
      if (!p) return
      await p.prompt()
      await p.userChoice
      deferredPrompt = null
      notify()
    },
    updateReady: waitingWorker !== null,
    applyUpdate: () => { waitingWorker?.postMessage('skip-waiting'); waitingWorker = null; notify() },
    standalone,
    iosHint: !standalone && isIosSafari(),
  }
}
