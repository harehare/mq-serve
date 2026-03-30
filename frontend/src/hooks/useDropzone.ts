import { useEffect, useRef } from 'react'

export function useDropzone(onDrop: (name: string, content: string) => void): void {
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => e.preventDefault()

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      for (const file of files) {
        if (/\.(md|mdx|markdown)$/i.test(file.name)) {
          const reader = new FileReader()
          reader.onload = () => {
            onDropRef.current(file.name, reader.result as string)
          }
          reader.readAsText(file)
        }
      }
    }

    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])
}
