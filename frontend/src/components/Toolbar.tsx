import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Sun, Moon, Monitor, ChevronsLeftRight, List,
  Copy, Check, RotateCcw, ChevronDown, AlertCircle, PanelLeft,
  Minus, Plus,
} from 'lucide-react'
import type { Session } from '../types'
import type { ParseResult } from '../lib/markdown'
import { THEMES, getTheme } from '../lib/themes'

const FONT_SIZES: Session['fontSize'][] = ['small', 'medium', 'large', 'xlarge']

interface Props {
  theme: Session['theme']
  effectiveThemeId: string
  onThemeChange: (t: Session['theme']) => void
  sidebarOpen: boolean
  onSidebarOpenChange: (v: boolean) => void
  wideView: boolean
  onWideViewChange: (w: boolean) => void
  showToc: boolean
  onShowTocChange: (s: boolean) => void
  showRaw: boolean
  onShowRawChange: (s: boolean) => void
  fontSize: Session['fontSize']
  onFontSizeChange: (f: Session['fontSize']) => void
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
  theme, effectiveThemeId, onThemeChange, sidebarOpen, onSidebarOpenChange,
  wideView, onWideViewChange, showToc, onShowTocChange,
  showRaw, onShowRawChange, fontSize, onFontSizeChange,
  rawContent, parseResult, onRestart,
}: Props) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [showCopyMenu, setShowCopyMenu] = useState(false)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const copyWrapRef = useRef<HTMLDivElement>(null)
  const themeWrapRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!showThemeMenu) return
    const handler = (e: MouseEvent) => {
      if (!themeWrapRef.current?.contains(e.target as Node)) {
        setShowThemeMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showThemeMenu])

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

  const ThemeIcon =
    theme === 'system' ? Monitor : getTheme(effectiveThemeId).mode === 'dark' ? Moon : Sun

  const CopyIcon = copyState === 'copied' ? Check : copyState === 'error' ? AlertCircle : Copy

  const selectTheme = useCallback((t: Session['theme']) => {
    onThemeChange(t)
    setShowThemeMenu(false)
  }, [onThemeChange])

  const fontSizeIndex = FONT_SIZES.indexOf(fontSize)
  const stepFontSize = useCallback((delta: number) => {
    const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, fontSizeIndex + delta))]
    onFontSizeChange(next)
  }, [fontSizeIndex, onFontSizeChange])

  return (
    <div className="toolbar">
      <button
        className={`bar-btn ${sidebarOpen ? 'active' : ''}`}
        onClick={() => onSidebarOpenChange(!sidebarOpen)}
        title="Toggle sidebar"
      >
        <PanelLeft size={ICON_SIZE} />
      </button>
      <div className="copy-wrap" ref={themeWrapRef}>
        <button
          className="bar-btn"
          onClick={() => setShowThemeMenu((v) => !v)}
          title={`Theme: ${theme === 'system' ? 'System' : getTheme(theme).label}`}
        >
          <ThemeIcon size={ICON_SIZE} />
          <ChevronDown size={12} />
        </button>
        {showThemeMenu && (
          <div className="copy-menu theme-menu">
            <button
              className={theme === 'system' ? 'active' : ''}
              onClick={() => selectTheme('system')}
            >
              <Monitor size={13} /> System
            </button>
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={theme === t.id ? 'active' : ''}
                onClick={() => selectTheme(t.id)}
              >
                <span className="theme-swatch" style={{ background: t.vars.accent }} />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
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
      <div className="font-size-group">
        <button
          className="bar-btn icon-btn"
          onClick={() => stepFontSize(-1)}
          disabled={fontSizeIndex <= 0}
          title="Decrease font size"
        >
          <Minus size={13} />
        </button>
        <span className="font-size-label" title={`Font size: ${fontSize}`}>A</span>
        <button
          className="bar-btn icon-btn"
          onClick={() => stepFontSize(1)}
          disabled={fontSizeIndex >= FONT_SIZES.length - 1}
          title="Increase font size"
        >
          <Plus size={13} />
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
