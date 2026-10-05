import { useEffect, useRef, useState } from 'react'
import { X, ChevronRight, History, Star, Layers, Link, Check, Trash2 } from 'lucide-react'
import type { WsStatus } from '../hooks/useWebSocket'
import { PRESETS, isTrivial, shareUrl } from '../lib/queries'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  onClear: () => void
  wsStatus: WsStatus
  queryError: string
  queryAll: boolean
  onQueryAllChange: (v: boolean) => void
  history: string[]
  saved: string[]
  onToggleSaved: () => void
  onClearHistory: () => void
}

export default function QueryBar({
  query, onQueryChange, onClear, wsStatus, queryError,
  queryAll, onQueryAllChange, history, saved, onToggleSaved, onClearHistory,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const pick = (q: string) => {
    onQueryChange(q)
    setMenuOpen(false)
    inputRef.current?.focus()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(query, queryAll))
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (e.g. plain http on a non-localhost host)
    }
  }

  const isSaved = saved.includes(query.trim())
  const trivial = isTrivial(query)

  return (
    <div className="querybar">
      <label className="querybar-label">
        mq
        <ChevronRight size={13} strokeWidth={3} />
      </label>
      <input
        ref={inputRef}
        className="query-input"
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="e.g. .h | select(level == 1)"
        spellCheck={false}
      />
      <button
        className="bar-btn icon-btn"
        onClick={onClear}
        title="Reset query to ."
      >
        <X size={15} />
      </button>
      <button
        className={`bar-btn icon-btn ${isSaved ? 'active' : ''}`}
        onClick={onToggleSaved}
        disabled={trivial}
        title={isSaved ? 'Remove from saved queries' : 'Save this query'}
      >
        <Star size={14} fill={isSaved ? 'currentColor' : 'none'} />
      </button>
      <div className="query-menu-wrap" ref={menuRef}>
        <button
          className="bar-btn icon-btn"
          onClick={() => setMenuOpen((v) => !v)}
          title="Saved queries, history and presets"
        >
          <History size={14} />
        </button>
        {menuOpen && (
          <div className="query-menu">
            {saved.length > 0 && (
              <>
                <div className="query-menu-heading">Saved</div>
                {saved.map((q) => (
                  <button key={`s-${q}`} className="query-menu-item" onClick={() => pick(q)}>
                    <Star size={11} fill="currentColor" /> <code>{q}</code>
                  </button>
                ))}
              </>
            )}
            {history.length > 0 && (
              <>
                <div className="query-menu-heading">
                  History
                  <button
                    className="query-menu-clear"
                    onClick={onClearHistory}
                    title="Clear history"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                {history.map((q) => (
                  <button key={`h-${q}`} className="query-menu-item" onClick={() => pick(q)}>
                    <code>{q}</code>
                  </button>
                ))}
              </>
            )}
            <div className="query-menu-heading">Presets</div>
            {PRESETS.map((p) => (
              <button key={p.query} className="query-menu-item" onClick={() => pick(p.query)}>
                {p.label} <code>{p.query}</code>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className={`bar-btn icon-btn ${queryAll ? 'active' : ''}`}
        onClick={() => onQueryAllChange(!queryAll)}
        title={queryAll ? 'Querying all files (click for current file only)' : 'Query all files'}
      >
        <Layers size={14} />
      </button>
      <button
        className={`bar-btn icon-btn ${linkCopied ? 'copied' : ''}`}
        onClick={copyLink}
        title="Copy link to this query"
      >
        {linkCopied ? <Check size={14} /> : <Link size={14} />}
      </button>
      {queryError && (
        <span className="query-error" title={queryError}>{queryError}</span>
      )}
      <span className={`ws-status ${wsStatus}`}>watch</span>
    </div>
  )
}
