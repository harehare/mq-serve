import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { Heading } from '../../lib/markdown'

interface Props {
  headings: Heading[]
  scrollContainer: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

export default function Toc({ headings, scrollContainer, onClose }: Props) {
  const [activeId, setActiveId] = useState<string>('')
  const activeRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const root = scrollContainer.current
    if (!root || headings.length === 0) return

    const elements = headings
      .map((h) => root.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`))
      .filter((el): el is HTMLElement => el !== null)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      { root, rootMargin: '-8px 0px -85% 0px', threshold: 0 },
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [headings, scrollContainer])

  // Auto-scroll active TOC item into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const root = scrollContainer.current
    const target = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveId(id)
    }
  }

  if (headings.length === 0) return null

  return (
    <nav className="toc">
      <div className="toc-header">
        <span className="toc-title">Contents</span>
        <button className="toc-close" onClick={onClose} title="Close table of contents">
          <X size={13} />
        </button>
      </div>
      <ul className="toc-list">
        {headings.map((h) => {
          const isActive = activeId === h.id
          return (
            <li key={h.id} className={`toc-item toc-h${h.level}`}>
              <a
                ref={isActive ? activeRef : null}
                href={`#${h.id}`}
                className={isActive ? 'active' : ''}
                onClick={(e) => handleClick(e, h.id)}
              >
                {h.text}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
