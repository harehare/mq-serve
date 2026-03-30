import { useState } from 'react'
import { ChevronDown, ChevronRight, Heading, Type } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import type { FileGroup as FileGroupType, Session } from '../../types'
import FileItem from './FileItem'
import { buildTree, TreeNodeView } from './TreeNode'

interface Props {
  group: FileGroupType
  currentPath: string | null
  session: Session
  onSessionUpdate: (partial: Partial<Session>) => void
  onFileSelect: (path: string) => void
}

export default function FileGroup({ group, currentPath, session, onSessionUpdate, onFileSelect }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const labelMode = session.sidebarLabel[group.root] ?? 'name'
  const viewMode = session.viewMode

  // Flat list with optional D&D reorder
  const storedOrder = session.fileOrder[group.root]
  const orderedFiles = storedOrder
    ? storedOrder.map((p) => group.files.find((f) => f.path === p)).filter(Boolean)
    : group.files
  const items = orderedFiles as typeof group.files

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const currentOrder = items.map((f) => f.path)
    const oldIdx = currentOrder.indexOf(active.id as string)
    const newIdx = currentOrder.indexOf(over.id as string)
    if (oldIdx < 0 || newIdx < 0) return
    onSessionUpdate({ fileOrder: { ...session.fileOrder, [group.root]: arrayMove(currentOrder, oldIdx, newIdx) } })
  }

  const toggleLabel = () => {
    const next = labelMode === 'name' ? 'heading' : 'name'
    onSessionUpdate({ sidebarLabel: { ...session.sidebarLabel, [group.root]: next } })
  }

  const tree = viewMode === 'tree' ? buildTree(group.root, group.files) : null

  return (
    <div className="file-group">
      <div className="group-header">
        <button className="group-collapse" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="group-name" title={group.root}>{group.name}</span>
        </button>
        <button
          className="group-label-toggle"
          onClick={toggleLabel}
          title={labelMode === 'name' ? 'Show heading title' : 'Show filename'}
        >
          {labelMode === 'name' ? <Type size={12} /> : <Heading size={12} />}
        </button>
      </div>

      {!collapsed && viewMode === 'tree' && tree && (
        <ul className="file-list">
          {tree.children.map((child, i) => (
            <TreeNodeView
              key={child.type === 'file' ? child.path : `${child.name}-${i}`}
              node={child}
              currentPath={currentPath}
              labelMode={labelMode}
              onSelect={onFileSelect}
              depth={0}
            />
          ))}
        </ul>
      )}

      {!collapsed && viewMode === 'list' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((f) => f.path)} strategy={verticalListSortingStrategy}>
            <ul className="file-list">
              {items.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  currentPath={currentPath}
                  labelMode={labelMode}
                  onSelect={onFileSelect}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
