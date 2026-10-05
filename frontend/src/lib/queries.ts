export interface Preset {
  label: string
  query: string
}

export const PRESETS: Preset[] = [
  { label: 'Headings', query: '.h' },
  { label: 'Top-level headings', query: '.h1' },
  { label: 'Heading text', query: '.h | to_text()' },
  { label: 'Code blocks', query: '.code' },
  { label: 'Links', query: '.link' },
  { label: 'Images', query: '.image' },
  { label: 'Lists', query: '.list' },
  { label: 'Unchecked tasks', query: '.list | select(.checked == false)' },
  { label: 'Tables', query: '.table' },
  { label: 'Blockquotes', query: '.blockquote' },
]

const MAX_HISTORY = 30

/** The identity query shows the document unchanged and is never worth recording. */
export function isTrivial(query: string): boolean {
  const q = query.trim()
  return q === '' || q === '.'
}

/** Moves `query` to the front of `history`, dropping duplicates and old entries. */
export function pushHistory(history: string[], query: string): string[] {
  const q = query.trim()
  if (isTrivial(q)) return history
  if (history[0] === q) return history
  return [q, ...history.filter((h) => h !== q)].slice(0, MAX_HISTORY)
}

export function toggleSaved(saved: string[], query: string): string[] {
  const q = query.trim()
  if (isTrivial(q)) return saved
  return saved.includes(q) ? saved.filter((s) => s !== q) : [q, ...saved]
}

/** URL that reopens the viewer with the given query (and scope) applied. */
export function shareUrl(query: string, queryAll: boolean): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  if (!isTrivial(query)) {
    url.searchParams.set('q', query)
    if (queryAll) url.searchParams.set('all', '1')
  }
  return url.toString()
}

export function readUrlQuery(): { query?: string; queryAll?: boolean } {
  const params = new URLSearchParams(window.location.search)
  const query = params.get('q')
  if (query === null) return {}
  return { query, queryAll: params.get('all') === '1' }
}

/** Mirrors the current query into the address bar so the page can be shared or reloaded. */
export function syncUrl(query: string, queryAll: boolean): void {
  const next = new URL(shareUrl(query, queryAll))
  if (next.search === window.location.search) return
  window.history.replaceState(null, '', next.pathname + next.search)
}
