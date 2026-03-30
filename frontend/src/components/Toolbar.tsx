import { useState, useCallback } from 'react'
import {
  Sun, Moon, Monitor, ChevronsLeftRight, List, FileCode,
  Copy, Check, RotateCcw, ChevronDown,
} from 'lucide-react'
import type { Session } from '../types'
import type { ParseResult } from '../lib/markdown'

interface Props {
  theme: Session['theme']
  onThemeChange: (t: Session['theme']) => void
  wideView: boolean
  onWideViewChange: (w: boolean) => void
  showToc: boolean
  onShowTocChange: (s: boolean) => void
  showRaw: boolean
  onShowRawChange: (s: boolean) => void
  rawContent: string
  parseResult: ParseResult | null
  onRestart: () => void
}

type CopyFormat = 'markdown' | 'html' | 'text'

function textFromHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.innerText
}

const ICON_SIZE = 15

export default function Toolbar({
  theme, onThemeChange, wideView, onWideViewChange,
  showToc, onShowTocChange, showRaw, onShowRawChange,
  rawContent, parseResult, onRestart,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [showCopyMenu, setShowCopyMenu] = useState(false)

  const copy = useCallback(async (format: CopyFormat) => {
    let text = ''
    if (format === 'markdown') text = rawContent
    else if (format === 'html') text = parseResult?.html ?? ''
    else text = textFromHtml(parseResult?.html ?? '')

    await navigator.clipboard.writeText(text)
    setCopied(true)
    setShowCopyMenu(false)
    setTimeout(() => setCopied(false), 1500)
  }, [rawContent, parseResult])

  const nextTheme: Session['theme'] =
    theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <div className="toolbar">
      <button
        className="bar-btn"
        onClick={() => onThemeChange(nextTheme)}
        title={`Theme: ${theme}`}
      >
        <ThemeIcon size={ICON_SIZE} />
      </button>
      <button
        className={`bar-btn ${wideView ? 'active' : ''}`}
        onClick={() => onWideViewChange(!wideView)}
        title="Wide/Narrow view"
      >
        <ChevronsLeftRight size={ICON_SIZE} />
      </button>
      <button
        className={`bar-btn ${showToc ? 'active' : ''}`}
        onClick={() => onShowTocChange(!showToc)}
        title="Table of contents"
      >
        <List size={ICON_SIZE} />
      </button>
      <button
        className={`bar-btn ${showRaw ? 'active' : ''}`}
        onClick={() => onShowRawChange(!showRaw)}
        title="Raw markdown"
      >
        <FileCode size={ICON_SIZE} />
      </button>
      <div className="copy-wrap">
        <button
          className={`bar-btn ${copied ? 'copied' : ''}`}
          onClick={() => setShowCopyMenu((v) => !v)}
          title="Copy"
        >
          {copied ? <Check size={ICON_SIZE} /> : <Copy size={ICON_SIZE} />}
          <ChevronDown size={12} />
        </button>
        {showCopyMenu && (
          <div className="copy-menu">
            <button onClick={() => copy('markdown')}>Markdown</button>
            <button onClick={() => copy('html')}>HTML</button>
            <button onClick={() => copy('text')}>Text</button>
          </div>
        )}
      </div>
      <button className="bar-btn" onClick={onRestart} title="Restart server">
        <RotateCcw size={ICON_SIZE} />
      </button>
    </div>
  )
}
