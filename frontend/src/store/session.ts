import type { Session } from '../types'

const KEY = 'mq-serve-session'

const defaultSession: Session = {
  currentPath: null,
  query: '.',
  viewMode: 'list',
  theme: 'system',
  wideView: false,
  showToc: false,
  showRaw: false,
  groupOrder: [],
  fileOrder: {},
  sidebarLabel: {},
}

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaultSession }
    return { ...defaultSession, ...JSON.parse(raw) }
  } catch {
    return { ...defaultSession }
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // localStorage unavailable
  }
}
