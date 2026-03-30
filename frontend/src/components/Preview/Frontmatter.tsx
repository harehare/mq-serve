import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  data: Record<string, unknown>
}

export default function Frontmatter({ data }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const entries = Object.entries(data)
  if (entries.length === 0) return null

  return (
    <div className="frontmatter">
      <button
        className="frontmatter-toggle"
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        Frontmatter
      </button>
      {!collapsed && (
        <table className="frontmatter-table">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
