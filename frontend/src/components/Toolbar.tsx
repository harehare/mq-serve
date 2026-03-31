import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Sun, Moon, Monitor, ChevronsLeftRight, List,
  Copy, Check, RotateCcw, ChevronDown, AlertCircle,
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
type CopyState = 'idle' | 'copied' | 'error'

function textFromHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.innerText
}

async function writeToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Fallback for environments without Clipboard API
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('execCommand copy failed')
}

const ICON_SIZE = 15

export default function Toolbar({
  theme, onThemeChange, wideView, onWideViewChange,
  showToc, onShowTocChange, showRaw, onShowRawChange,
  rawContent, parseResult, onRestart,
}: Props) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [showCopyMenu, setShowCopyMenu] = useState(false)
  const copyWrapRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!showCopyMenu) return
    const handler = (e: MouseEvent) => {
      if (!copyWrapRef.current?.contains(e.target as Node)) {
        setShowCopyMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCopyMenu])

  const copy = useCallback(async (format: CopyFormat) => {
    let text = ''
    if (format === 'markdown') text = rawContent
    else if (format === 'html') text = parseResult?.html ?? ''
    else text = textFromHtml(parseResult?.html ?? '')

    setShowCopyMenu(false)
    try {
      await writeToClipboard(text)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
    setTimeout(() => setCopyState('idle'), 1500)
  }, [rawContent, parseResult])

  const nextTheme: Session['theme'] =
    theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  const CopyIcon = copyState === 'copied' ? Check : copyState === 'error' ? AlertCircle : Copy

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
      <div className="view-toggle">
        <button
          className={!showRaw ? 'active' : ''}
          onClick={() => onShowRawChange(false)}
        >
          Preview
        </button>
        <button
          className={showRaw ? 'active' : ''}
          onClick={() => onShowRawChange(true)}
        >
          Code
        </button>
      </div>
      <div className="copy-wrap" ref={copyWrapRef}>
        <button
          className={`bar-btn ${copyState === 'copied' ? 'copied' : copyState === 'error' ? 'copy-error' : ''}`}
          onClick={() => setShowCopyMenu((v) => !v)}
          title="Copy"
        >
          <CopyIcon size={ICON_SIZE} />
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
