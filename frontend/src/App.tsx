import { useState, useEffect, useCallback, useRef } from 'react'
import type { FileGroup, MultiQueryResponse, SearchResult, Session } from './types'
import { loadSession, saveSession } from './store/session'
import { useWebSocket } from './hooks/useWebSocket'
import { useDropzone } from './hooks/useDropzone'
import { renderMarkdown, type ParseResult } from './lib/markdown'
import { preprocessMdx } from './lib/mdx'
import { isTrivial, pushHistory, readUrlQuery, syncUrl, toggleSaved } from './lib/queries'
import { getTheme, applyTheme } from './lib/themes'
import QueryBar from './components/QueryBar'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import Preview from './components/Preview'

interface InMemoryFile { name: string; content: string }

/** Joins per-file results into one document, titling each section with its path. */
function combineResults(results: { path: string; result: string }[]): string {
  if (results.length === 0) return '*No matches in any file.*'
  const dirs = results.map((r) => r.path.slice(0, r.path.lastIndexOf('/') + 1))
  let prefix = dirs[0]
  for (const d of dirs) {
    while (!d.startsWith(prefix)) prefix = prefix.slice(0, prefix.lastIndexOf('/', prefix.length - 2) + 1)
  }
  return results
    .map((r) => `## ${r.path.slice(prefix.length)}\n\n${r.result.trimEnd()}`)
    .join('\n\n---\n\n')
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export default function App() {
  const [session, setSession] = useState<Session>(() => ({ ...loadSession(), ...readUrlQuery() }))
  const [groups, setGroups] = useState<FileGroup[]>([])
  const [rawContent, setRawContent] = useState('')
  const [queryError, setQueryError] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [inMemoryFiles, setInMemoryFiles] = useState<InMemoryFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [changeTick, setChangeTick] = useState(0)
  const rawContentRef = useRef(rawContent)
  useEffect(() => { rawContentRef.current = rawContent }, [rawContent])
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  const debouncedQuery = useDebounce(session.query, 350)

  const effectiveThemeId =
    session.theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : session.theme
  const themePreset = getTheme(effectiveThemeId)

  // Sync system theme preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Apply theme to document
  useEffect(() => {
    applyTheme(themePreset)
  }, [themePreset])

  // Apply font size to document
  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', session.fontSize)
  }, [session.fontSize])

  const updateSession = useCallback((partial: Partial<Session>) => {
    setSession((prev) => {
      const next = { ...prev, ...partial }
      saveSession(next)
      return next
    })
  }, [])

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/files')
      const data = await res.json() as { groups: FileGroup[] }
      setGroups(data.groups)
    } catch {
      // server unreachable
    }
  }, [])

  // Initialize: fetch file list, restore saved path or auto-select first file
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/files')
        const data = await res.json() as { groups: FileGroup[] }
        setGroups(data.groups)

        const allFiles = data.groups.flatMap((g) => g.files)
        if (allFiles.length === 0) return

        const savedPath = session.currentPath
        const targetPath =
          savedPath && allFiles.some((f) => f.path === savedPath)
            ? savedPath
            : allFiles[0].path

        loadFile(targetPath)
      } catch {
        // server unreachable
      }
    }
    init()
  }, []) // intentionally on mount only

  const loadFile = useCallback(async (path: string) => {
    setIsLoading(true)
    // Add to open tabs if not already open
    setSession((prev) => {
      if (prev.openPaths.includes(path)) return prev
      const next = { ...prev, openPaths: [...prev.openPaths, path] }
      saveSession(next)
      return next
    })
    const mem = inMemoryFiles.find((f) => f.name === path)
    if (mem) {
      if (mem.content === rawContentRef.current) setIsLoading(false)
      setRawContent(mem.content)
      updateSession({ currentPath: path })
      return
    }
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`)
      if (res.ok) {
        const content = await res.text()
        if (content === rawContentRef.current) setIsLoading(false)
        setRawContent(content)
        updateSession({ currentPath: path })
      } else {
        setIsLoading(false)
      }
    } catch {
      setIsLoading(false)
    }
  }, [inMemoryFiles, updateSession])

  const closeTab = useCallback((path: string) => {
    setSession((prev) => {
      const idx = prev.openPaths.indexOf(path)
      const newOpen = prev.openPaths.filter((p) => p !== path)
      let newCurrent = prev.currentPath
      if (prev.currentPath === path) {
        // Switch to adjacent tab
        newCurrent = newOpen[Math.max(0, idx - 1)] ?? newOpen[0] ?? null
      }
      const next = { ...prev, openPaths: newOpen, currentPath: newCurrent }
      saveSession(next)
      return next
    })
  }, [])

  const switchTab = useCallback((path: string) => {
    updateSession({ currentPath: path })
    loadFile(path)
  }, [updateSession, loadFile])

  const recordHistory = useCallback((query: string) => {
    setSession((prev) => {
      const queryHistory = pushHistory(prev.queryHistory, query)
      if (queryHistory === prev.queryHistory) return prev
      const next = { ...prev, queryHistory }
      saveSession(next)
      return next
    })
  }, [])

  // Keep the address bar in step with the query so the page can be shared.
  useEffect(() => {
    syncUrl(debouncedQuery, session.queryAll)
  }, [debouncedQuery, session.queryAll])

  // Run mq query when content or query changes, then render markdown in one step
  useEffect(() => {
    let cancelled = false
    const trivial = isTrivial(debouncedQuery) || debouncedQuery.trim() === '.'

    const show = (markdown: string) =>
      renderMarkdown(markdown, themePreset.mode).then((parsed) => {
        if (cancelled) return
        setParseResult(parsed)
        setIsLoading(false)
      })

    const fail = (message: string) => {
      if (cancelled) return
      setQueryError(message)
      setIsLoading(false)
    }

    // Query across every served file
    if (session.queryAll && !trivial) {
      setIsLoading(true)
      fetch('/api/query-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: debouncedQuery }),
      })
        .then((r) => r.json())
        .then((data: MultiQueryResponse) => {
          if (cancelled) return
          if (data.error) return fail(data.error)
          setQueryError('')
          recordHistory(debouncedQuery)
          return show(combineResults(data.results))
        })
        .catch(() => fail('Network error'))
      return () => { cancelled = true }
    }

    if (!rawContent) {
      setIsLoading(false)
      return
    }
    const isMdx = session.currentPath?.endsWith('.mdx') ?? false
    const content = isMdx ? preprocessMdx(rawContent) : rawContent

    if (trivial) {
      setQueryError('')
      show(content).catch(console.error)
      return () => { cancelled = true }
    }

    fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, query: debouncedQuery }),
    })
      .then((r) => r.json())
      .then((data: { result?: string; error?: string }) => {
        if (cancelled) return
        if (data.error) return fail(data.error)
        setQueryError('')
        recordHistory(debouncedQuery)
        return show(data.result ?? '')
      })
      .catch(() => fail('Network error'))
    return () => { cancelled = true }
  }, [
    rawContent, debouncedQuery, session.currentPath, session.queryAll,
    // Re-run the cross-file query whenever any file changes.
    session.queryAll ? changeTick : 0,
    themePreset.mode, recordHistory,
  ])

  // WebSocket live reload
  const wsStatus = useWebSocket(
    useCallback(
      (data: unknown) => {
        const msg = data as { type: string; path?: string }
        setChangeTick((t) => t + 1)
        if (msg.type === 'change') {
          fetchGroups()
          if (msg.path && msg.path === session.currentPath) {
            loadFile(msg.path)
          }
        } else if (msg.type === 'reload') {
          // A new file was added to the server – just refresh the sidebar.
          fetchGroups()
        }
      },
      [fetchGroups, loadFile, session.currentPath]
    )
  )

  // OS file drag-and-drop
  useDropzone(
    useCallback(
      (name: string, content: string) => {
        setInMemoryFiles((prev) => {
          const idx = prev.findIndex((f) => f.name === name)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = { name, content }
            return next
          }
          return [...prev, { name, content }]
        })
        setRawContent(content)
        updateSession({ currentPath: name })
      },
      [updateSession]
    )
  )

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const results = await res.json() as SearchResult[]
      setSearchResults(results)
    } catch {
      // ignore
    }
  }, [])

  const handleRestart = useCallback(async () => {
    try {
      await fetch('/api/restart', { method: 'POST' })
    } finally {
      window.location.reload()
    }
  }, [])

  return (
    <div className={`app${session.sidebarOpen ? '' : ' sidebar-hidden'}`}>
      <title>{session.currentPath ? `mq-serve | ${session.currentPath}` : 'mq-serve'}</title>
      <QueryBar
        query={session.query}
        onQueryChange={(q) => updateSession({ query: q })}
        onClear={() => updateSession({ query: '.' })}
        wsStatus={wsStatus}
        queryError={queryError}
        queryAll={session.queryAll}
        onQueryAllChange={(v) => updateSession({ queryAll: v })}
        history={session.queryHistory}
        saved={session.savedQueries}
        onToggleSaved={() =>
          updateSession({ savedQueries: toggleSaved(session.savedQueries, session.query) })
        }
        onClearHistory={() => updateSession({ queryHistory: [] })}
      />
      <Toolbar
        theme={session.theme}
        effectiveThemeId={effectiveThemeId}
        onThemeChange={(t) => updateSession({ theme: t })}
        sidebarOpen={session.sidebarOpen}
        onSidebarOpenChange={(v) => updateSession({ sidebarOpen: v })}
        wideView={session.wideView}
        onWideViewChange={(w) => updateSession({ wideView: w })}
        showToc={session.showToc}
        onShowTocChange={(t) => updateSession({ showToc: t })}
        showRaw={session.showRaw}
        onShowRawChange={(r) => updateSession({ showRaw: r })}
        fontSize={session.fontSize}
        onFontSizeChange={(f) => updateSession({ fontSize: f })}
        rawContent={rawContent}
        parseResult={parseResult}
        onRestart={handleRestart}
      />
      <Sidebar
        groups={groups}
        inMemoryFiles={inMemoryFiles}
        currentPath={session.currentPath}
        onFileSelect={loadFile}
        session={session}
        onSessionUpdate={updateSession}
        searchResults={searchResults}
        onSearch={handleSearch}
      />
      <Preview
        parseResult={parseResult}
        rawContent={rawContent}
        showRaw={session.showRaw}
        wideView={session.wideView}
        showToc={session.showToc}
        onShowTocChange={(t) => updateSession({ showToc: t })}
        isLoading={isLoading}
        openPaths={session.openPaths}
        currentPath={session.currentPath}
        onTabSelect={switchTab}
        onTabClose={closeTab}
      />
    </div>
  )
}
