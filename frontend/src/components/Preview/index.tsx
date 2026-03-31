import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import type { ParseResult } from '../../lib/markdown'
import Frontmatter from './Frontmatter'
import Toc from './Toc'

mermaid.initialize({ startOnLoad: false, theme: 'default' })

interface Props {
  parseResult: ParseResult | null
  rawContent: string
  showRaw: boolean
  wideView: boolean
  showToc: boolean
  theme: 'light' | 'dark'
  isLoading: boolean
}

export default function Preview({ parseResult, rawContent, showRaw, wideView, showToc, theme, isLoading }: Props) {
  const articleRef = useRef<HTMLElement>(null)
  const mermaidCountRef = useRef(0)

  // Re-render mermaid diagrams after HTML is injected
  useEffect(() => {
    const el = articleRef.current
    if (!el) return

    const diagrams = el.querySelectorAll<HTMLDivElement>('.mermaid[data-mermaid]')
    if (diagrams.length === 0) return

    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
    })

    diagrams.forEach(async (div) => {
      const code = div.getAttribute('data-mermaid') ?? div.textContent ?? ''
      const id = `mermaid-${++mermaidCountRef.current}`
      try {
        const { svg } = await mermaid.render(id, code)
        div.innerHTML = svg
        div.removeAttribute('data-mermaid')
      } catch (err) {
        div.textContent = `Mermaid error: ${err}`
      }
    })
  }, [parseResult?.html, theme])

  const maxWidth = wideView ? '1400px' : '900px'

  return (
    <div className="preview-wrap">
      {isLoading && <div className="loading-bar" />}
      {showToc && parseResult && parseResult.headings.length > 0 && (
        <Toc headings={parseResult.headings} />
      )}
      <div className="preview-main">
        {showRaw ? (
          <pre className="raw-content">{rawContent}</pre>
        ) : (
          <>
            {parseResult?.frontmatter && (
              <Frontmatter data={parseResult.frontmatter} />
            )}
            <article
              ref={articleRef}
              className="preview"
              style={{ maxWidth }}
              dangerouslySetInnerHTML={{ __html: parseResult?.html ?? '' }}
            />
          </>
        )}
      </div>
    </div>
  )
}
