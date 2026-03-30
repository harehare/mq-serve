import type { Heading } from '../../lib/markdown'

interface Props {
  headings: Heading[]
}

export default function Toc({ headings }: Props) {
  if (headings.length === 0) return null

  return (
    <nav className="toc">
      <div className="toc-title">Contents</div>
      <ul className="toc-list">
        {headings.map((h) => (
          <li key={h.id} className={`toc-item toc-h${h.level}`}>
            <a href={`#${h.id}`}>{h.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
