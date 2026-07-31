import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import type { ParseResult } from '../../lib/markdown'
import { highlightMarkdown } from '../../lib/markdown'
import Frontmatter from './Frontmatter'
import Toc from './Toc'

type ZoomTarget = { kind: 'img'; src: string; alt: string } | { kind: 'html'; html: string }

interface Props {
  parseResult: ParseResult | null
  rawContent: string
  showRaw: boolean
  wideView: boolean
  showToc: boolean
  onShowTocChange: (v: boolean) => void
  isLoading: boolean
  openPaths: string[]
  currentPath: string | null
  onTabSelect: (path: string) => void
  onTabClose: (path: string) => void
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path
}

export default function Preview({ parseResult, rawContent, showRaw, wideView, showToc, onShowTocChange, isLoading, openPaths, currentPath, onTabSelect, onTabClose }: Props) {
  const articleRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const [highlightedCode, setHighlightedCode] = useState('')
  const [zoom, setZoom] = useState<ZoomTarget | null>(null)

  // Highlight raw markdown source when Code view is active
  useEffect(() => {
    if (!showRaw || !rawContent) return
    highlightMarkdown(rawContent).then(setHighlightedCode)
  }, [rawContent, showRaw])

  // Click-to-zoom for images and rendered mermaid diagrams.
  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement
      setZoom({ kind: 'img', src: img.src, alt: img.alt })
      return
    }
    const mermaidEl = target.closest<HTMLElement>('.mermaid')
    const svg = mermaidEl?.querySelector('svg')
    if (svg) {
      setZoom({ kind: 'html', html: svg.outerHTML })
    }
  }, [])

  // Close the zoom overlay on Escape.
  useEffect(() => {
    if (!zoom) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [zoom])

  const maxWidth = wideView ? '1400px' : '900px'

  return (
    <div className="preview-wrap">
      {isLoading && <div className="loading-bar" />}
      {openPaths.length > 1 && (
        <div className="tab-bar">
          {openPaths.map((path) => (
            <div key={path} className={`tab ${path === currentPath ? 'active' : ''}`}>
              <button className="tab-label" onClick={() => onTabSelect(path)}>
                {fileName(path)}
              </button>
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); onTabClose(path) }}
                aria-label="Close tab"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="preview-body">
        <div className="preview-main" ref={mainRef}>
          {showRaw ? (
            <div
              className="raw-highlighted"
              dangerouslySetInnerHTML={{ __html: highlightedCode || rawContent }}
            />
          ) : (
            <>
              {parseResult?.frontmatter && (
                <Frontmatter data={parseResult.frontmatter} />
              )}
              <article
                ref={articleRef}
                className="preview"
                style={{ maxWidth }}
                onClick={handlePreviewClick}
                dangerouslySetInnerHTML={{ __html: parseResult?.html ?? '' }}
              />
            </>
          )}
        </div>
        {showToc && parseResult && parseResult.headings.length > 0 && (
          <Toc headings={parseResult.headings} scrollContainer={mainRef} onClose={() => onShowTocChange(false)} />
        )}
      </div>
      {zoom && (
        <div className="zoom-overlay" onClick={() => setZoom(null)}>
          <button className="zoom-close" aria-label="Close" onClick={() => setZoom(null)}>
            <X size={20} />
          </button>
          {zoom.kind === 'img' ? (
            <img className="zoom-content" src={zoom.src} alt={zoom.alt} />
          ) : (
            <div className="zoom-content zoom-svg" dangerouslySetInnerHTML={{ __html: zoom.html }} />
          )}
        </div>
      )}
    </div>
  )
}
