import { useState, useEffect, useCallback } from 'react'
import type { FileGroup, SearchResult, Session } from './types'
import { loadSession, saveSession } from './store/session'
import { useWebSocket } from './hooks/useWebSocket'
import { useDropzone } from './hooks/useDropzone'
import { renderMarkdown, type ParseResult } from './lib/markdown'
import { preprocessMdx } from './lib/mdx'
import QueryBar from './components/QueryBar'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import Preview from './components/Preview'

interface InMemoryFile { name: string; content: string }

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export default function App() {
  const [session, setSession] = useState<Session>(loadSession)
  const [groups, setGroups] = useState<FileGroup[]>([])
  const [rawContent, setRawContent] = useState('')
  const [queryError, setQueryError] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [inMemoryFiles, setInMemoryFiles] = useState<InMemoryFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  const debouncedQuery = useDebounce(session.query, 350)

  const effectiveTheme: 'light' | 'dark' =
    session.theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : session.theme

  // Sync system theme preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
  }, [effectiveTheme])

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
    const mem = inMemoryFiles.find((f) => f.name === path)
    if (mem) {
      setRawContent(mem.content)
      updateSession({ currentPath: path })
      return
    }
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`)
      if (res.ok) {
        const content = await res.text()
        setRawContent(content)
        updateSession({ currentPath: path })
      } else {
        setIsLoading(false)
      }
    } catch {
      setIsLoading(false)
    }
  }, [inMemoryFiles, updateSession])

  // Run mq query when content or query changes, then render markdown in one step
  useEffect(() => {
    if (!rawContent) {
      setIsLoading(false)
      return
    }
    const isMdx = session.currentPath?.endsWith('.mdx') ?? false
    const content = isMdx ? preprocessMdx(rawContent) : rawContent

    if (debouncedQuery.trim() === '.' || debouncedQuery.trim() === '') {
      setQueryError('')
      renderMarkdown(content).then((result) => {
        setParseResult(result)
        setIsLoading(false)
      }).catch(console.error)
      return
    }

    fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, query: debouncedQuery }),
    })
      .then((r) => r.json())
      .then((data: { result?: string; error?: string }) => {
        if (data.error) {
          setQueryError(data.error)
          setIsLoading(false)
        } else {
          const result = data.result ?? ''
          setQueryError('')
          return renderMarkdown(result).then((parsed) => {
            setParseResult(parsed)
            setIsLoading(false)
          })
        }
      })
      .catch(() => {
        setQueryError('Network error')
        setIsLoading(false)
      })
  }, [rawContent, debouncedQuery, session.currentPath])

  // WebSocket live reload
  const wsStatus = useWebSocket(
    useCallback(
      (data: unknown) => {
        const msg = data as { type: string; path?: string }
        if (msg.type === 'change') {
          fetchGroups()
          if (msg.path && msg.path === session.currentPath) {
            loadFile(msg.path)
          }
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
    <div className="app">
      <QueryBar
        query={session.query}
        onQueryChange={(q) => updateSession({ query: q })}
        onClear={() => updateSession({ query: '.' })}
        wsStatus={wsStatus}
        queryError={queryError}
      />
      <Toolbar
        theme={session.theme}
        onThemeChange={(t) => updateSession({ theme: t })}
        wideView={session.wideView}
        onWideViewChange={(w) => updateSession({ wideView: w })}
        showToc={session.showToc}
        onShowTocChange={(t) => updateSession({ showToc: t })}
        showRaw={session.showRaw}
        onShowRawChange={(r) => updateSession({ showRaw: r })}
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
        theme={effectiveTheme}
        isLoading={isLoading}
      />
    </div>
  )
}
