import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { FileEntry, Session } from '../../types'

interface Props {
  file: FileEntry
  currentPath: string | null
  labelMode: Session['sidebarLabel'][string]
  onSelect: (path: string) => void
}

export default function FileItem({ file, currentPath, labelMode, onSelect }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: file.path,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const label = labelMode === 'heading' && file.title ? file.title : file.name
  const isActive = file.path === currentPath

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`file-item ${isActive ? 'active' : ''}`}
    >
      <span className="drag-handle" {...attributes} {...listeners}>
        <GripVertical size={13} />
      </span>
      <button
        className="file-item-btn"
        onClick={() => onSelect(file.path)}
        title={file.path}
      >
        {label}
      </button>
    </li>
  )
}
