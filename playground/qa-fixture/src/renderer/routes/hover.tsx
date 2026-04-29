import { useState } from 'react'

export function Hover() {
  const [activeId, setActiveId] = useState<string | null>(null)

  return (
    <div className="section" data-testid="hover-section">
      <h2>Hover</h2>
      <p>
        Hover any button to see its tooltip rendered (browser <code>title=</code> attribute) and
        the custom tooltip below. Verifies <code>hover_by_selector</code> and
        <code>hover_by_text</code>.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        {['save', 'cancel', 'delete'].map((id) => (
          <button
            key={id}
            data-testid={`hover-btn-${id}`}
            title={`Tooltip for ${id}`}
            onMouseEnter={() => setActiveId(id)}
            onMouseLeave={() => setActiveId((current) => (current === id ? null : current))}
          >
            {id}
          </button>
        ))}
      </div>
      <p>
        Active hover target:{' '}
        <code data-testid="hover-active">{activeId ?? '(none)'}</code>
      </p>
    </div>
  )
}
