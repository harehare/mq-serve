import { useRef } from 'react'
import { X } from 'lucide-react'
import type { WsStatus } from '../hooks/useWebSocket'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  onClear: () => void
  wsStatus: WsStatus
  queryError: string
}

export default function QueryBar({ query, onQueryChange, onClear, wsStatus, queryError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="querybar">
      <label className="querybar-label">mq&gt;</label>
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
      {queryError && (
        <span className="query-error" title={queryError}>{queryError}</span>
      )}
      <span className={`ws-status ${wsStatus}`}>watch</span>
    </div>
  )
}
