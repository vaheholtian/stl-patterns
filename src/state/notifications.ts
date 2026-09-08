import { create } from 'zustand'

export type NoticeTone = 'info' | 'warning' | 'error'
interface Notice { id: number; key: string; title: string; lines: string[]; tone: NoticeTone }
let nextId = 0
export const useNotifications = create<{
  notices: Notice[]
  show: (key: string, title: string, lines: string[], tone?: NoticeTone) => void
  dismiss: (id: number) => void
}>((set) => ({
  notices: [],
  show: (key, title, lines, tone = 'info') => set(s => ({ notices: [
    ...s.notices.filter(n => n.key !== key),
    ...(lines.length ? [{ id: ++nextId, key, title, lines, tone }] : []),
  ].slice(-4) })),
  dismiss: id => set(s => ({ notices: s.notices.filter(n => n.id !== id) })),
}))
