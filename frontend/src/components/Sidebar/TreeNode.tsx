import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react'
import type { Session } from '../../types'

export interface TreeFile {
    type: 'file'
    name: string
    path: string
    title?: string
}

export interface TreeDir {
    type: 'dir'
    name: string
    children: TreeNode[]
}

export type TreeNode = TreeFile | TreeDir

export function buildTree(
    root: string,
    files: { path: string; name: string; title?: string }[],
): TreeDir {
    const rootName = root.replace(/\/$/, '').split('/').pop() || root
    const rootNode: TreeDir = { type: 'dir', name: rootName, children: [] }

    for (const file of files) {
        const prefix = root.endsWith('/') ? root : root + '/'
        const rel = file.path.startsWith(prefix)
            ? file.path.slice(prefix.length)
            : file.path
        const parts = rel.split('/')

        let current = rootNode
        for (let i = 0; i < parts.length - 1; i++) {
            const dirName = parts[i]
            let dir = current.children.find(
                (c): c is TreeDir => c.type === 'dir' && c.name === dirName,
            )
            if (!dir) {
                dir = { type: 'dir', name: dirName, children: [] }
                current.children.push(dir)
            }
            current = dir
        }

        current.children.push({
            type: 'file',
            name: file.name,
            path: file.path,
            title: file.title,
        })
    }

    return rootNode
}

interface NodeProps {
    node: TreeNode
    currentPath: string | null
    labelMode: Session['sidebarLabel'][string]
    onSelect: (path: string) => void
    depth: number
}

export function TreeNodeView({ node, currentPath, labelMode, onSelect, depth }: NodeProps) {
    const [collapsed, setCollapsed] = useState(true)
    const indent = depth * 12

    if (node.type === 'file') {
        const label = labelMode === 'heading' && node.title ? node.title : node.name
        const isActive = node.path === currentPath
        return (
            <li className={`file-item ${isActive ? 'active' : ''}`}>
                <button
                    className="file-item-btn"
                    style={{ paddingLeft: 8 + indent }}
                    onClick={() => onSelect(node.path)}
                    title={node.path}
                >
                    {label}
                </button>
            </li>
        )
    }

    return (
        <li className="tree-dir-item">
            <button
                className="tree-dir-label"
                style={{ paddingLeft: 8 + indent }}
                onClick={() => setCollapsed((v) => !v)}
            >
                {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                {collapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
                <span>{node.name}</span>
            </button>
            {!collapsed && (
                <ul className="file-list">
                    {node.children.map((child, i) => (
                        <TreeNodeView
                            key={child.type === 'file' ? child.path : `${child.name}-${i}`}
                            node={child}
                            currentPath={currentPath}
                            labelMode={labelMode}
                            onSelect={onSelect}
                            depth={depth + 1}
                        />
                    ))}
                </ul>
            )}
        </li>
    )
}
