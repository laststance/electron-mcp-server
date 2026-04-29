import { useState } from 'react'

interface Item {
  id: string
  label: string
}

const initialSource: Item[] = [
  { id: 'item-1', label: 'Apple' },
  { id: 'item-2', label: 'Banana' },
  { id: 'item-3', label: 'Cherry' },
]

export function Drag() {
  const [source, setSource] = useState<Item[]>(initialSource)
  const [target, setTarget] = useState<Item[]>([])
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDropOnTarget = (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedId) return
    const item = source.find((entry) => entry.id === draggedId)
    if (!item) return
    setSource(source.filter((entry) => entry.id !== draggedId))
    setTarget([...target, item])
    setDraggedId(null)
  }

  const handleDropOnSource = (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedId) return
    const item = target.find((entry) => entry.id === draggedId)
    if (!item) return
    setTarget(target.filter((entry) => entry.id !== draggedId))
    setSource([...source, item])
    setDraggedId(null)
  }

  const allow = (e: React.DragEvent) => e.preventDefault()

  return (
    <div className="section" data-testid="drag-section">
      <h2>Drag &amp; Drop</h2>
      <p>Drag fruits from the left pane to the right pane.</p>
      <div style={{ display: 'flex', gap: 16 }}>
        <div
          data-testid="drag-source"
          onDragOver={allow}
          onDrop={handleDropOnSource}
          style={paneStyle}
        >
          <strong>Source</strong>
          {source.map((item) => (
            <div
              key={item.id}
              data-testid={`drag-item-${item.id}`}
              draggable
              onDragStart={(e) => handleDragStart(e, item.id)}
              style={itemStyle}
            >
              {item.label}
            </div>
          ))}
        </div>
        <div
          data-testid="drag-target"
          onDragOver={allow}
          onDrop={handleDropOnTarget}
          style={paneStyle}
        >
          <strong>Target</strong>
          {target.map((item) => (
            <div
              key={item.id}
              data-testid={`drag-item-${item.id}`}
              draggable
              onDragStart={(e) => handleDragStart(e, item.id)}
              style={itemStyle}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>
      <p data-testid="drag-status">
        Source size: {source.length} / Target size: {target.length}
      </p>
    </div>
  )
}

const paneStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 200,
  padding: 12,
  border: '2px dashed #b0b0b3',
  borderRadius: 8,
  background: '#fafafb',
}

const itemStyle: React.CSSProperties = {
  marginTop: 6,
  padding: '6px 10px',
  background: '#ffffff',
  border: '1px solid #c0c0c2',
  borderRadius: 6,
  cursor: 'grab',
}
