import { useState } from 'react'
import { Search, List, GitBranch, ArrowLeft } from 'lucide-react'
import type { FileGroup, SearchResult, Session } from '../../types'
import FileGroupComponent from './FileGroup'
import SearchPanel from './SearchPanel'
import { navigateToGroup } from '../../lib/groups'

interface InMemoryFile { name: string; content: string }

interface Props {
  groups: FileGroup[]
  /** True when only one group is shown because the URL is `/<group>`. */
  scoped: boolean
  inMemoryFiles: InMemoryFile[]
  currentPath: string | null
  onFileSelect: (path: string) => void
  session: Session
  onSessionUpdate: (partial: Partial<Session>) => void
  searchResults: SearchResult[]
  onSearch: (query: string) => void
}

export default function Sidebar({
  groups, scoped, inMemoryFiles, currentPath, onFileSelect,
  session, onSessionUpdate, searchResults, onSearch,
}: Props) {
  const [showSearch, setShowSearch] = useState(false)

  const toggleView = () => {
    onSessionUpdate({ viewMode: session.viewMode === 'list' ? 'tree' : 'list' })
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        {scoped && (
          <button
            className="bar-btn icon-btn"
            onClick={() => navigateToGroup(null)}
            title="Show all groups"
          >
            <ArrowLeft size={15} />
          </button>
        )}
        <button
          className={`bar-btn icon-btn ${showSearch ? 'active' : ''}`}
          onClick={() => setShowSearch((v) => !v)}
          title="Search"
        >
          <Search size={15} />
        </button>
        <button
          className={`bar-btn icon-btn ${session.viewMode === 'tree' ? 'active' : ''}`}
          onClick={toggleView}
          title="Toggle list/tree"
        >
          {session.viewMode === 'list' ? <List size={15} /> : <GitBranch size={15} />}
        </button>
      </div>

      {showSearch && (
        <SearchPanel
          results={searchResults}
          onSearch={onSearch}
          onResultClick={(path) => {
            onFileSelect(path)
            setShowSearch(false)
          }}
        />
      )}

      <div className="sidebar-content">
        {groups.map((group) => (
          <FileGroupComponent
            key={group.root}
            group={group}
            currentPath={currentPath}
            session={session}
            onSessionUpdate={onSessionUpdate}
            onFileSelect={onFileSelect}
            linkable={!scoped && groups.length > 1}
          />
        ))}

        {inMemoryFiles.length > 0 && (
          <div className="file-group">
            <div className="group-header">
              <span className="group-name">Dropped files</span>
            </div>
            <ul className="file-list">
              {inMemoryFiles.map((f) => (
                <li
                  key={f.name}
                  className={`file-item ${f.name === currentPath ? 'active' : ''}`}
                >
                  <button className="file-item-btn" onClick={() => onFileSelect(f.name)}>
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </nav>
  )
}
