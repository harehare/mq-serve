import { useState, useRef } from 'react'
import type { SearchResult } from '../../types'

interface Props {
  results: SearchResult[]
  onSearch: (query: string) => void
  onResultClick: (path: string) => void
}

export default function SearchPanel({ results, onSearch, onResultClick }: Props) {
  const [query, setQuery] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = (value: string) => {
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSearch(value), 300)
  }

  return (
    <div className="search-panel">
      <input
        className="search-input"
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search files…"
      />
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={i} className="search-result" onClick={() => onResultClick(r.path)}>
              <span className="search-result-name">{r.name}</span>
              <span className="search-result-line">:{r.line}</span>
              <span className="search-result-snippet">{r.snippet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
