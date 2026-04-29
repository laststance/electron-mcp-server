import { useEffect, useRef, useState } from 'react'

interface MenuPosition {
  x: number
  y: number
}

export function Context() {
  const [menuAt, setMenuAt] = useState<MenuPosition | null>(null)
  const [lastAction, setLastAction] = useState<string>('')
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const dismiss = () => setMenuAt(null)
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const bounds = containerRef.current?.getBoundingClientRect()
    setMenuAt({
      x: e.clientX - (bounds?.left ?? 0),
      y: e.clientY - (bounds?.top ?? 0),
    })
  }

  const choose = (action: string) => {
    setLastAction(action)
    setMenuAt(null)
  }

  return (
    <div className="section" data-testid="context-section">
      <h2>Context Menu</h2>
      <p>
        Right-click the orange box below to open a custom DOM-based context menu. Verifies{' '}
        <code>right_click_by_selector</code>.
      </p>
      <p>
        Last action: <code data-testid="context-last-action">{lastAction || '(none)'}</code>
      </p>
      <div
        ref={containerRef}
        data-testid="context-target"
        onContextMenu={handleContextMenu}
        style={{
          position: 'relative',
          width: 320,
          height: 200,
          background: '#fde68a',
          border: '1px solid #d3a73a',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
        }}
      >
        Right-click here
        {menuAt !== null && (
          <ul
            data-testid="context-menu"
            role="menu"
            style={{
              position: 'absolute',
              top: menuAt.y,
              left: menuAt.x,
              margin: 0,
              padding: 4,
              listStyle: 'none',
              background: '#ffffff',
              border: '1px solid #c0c0c2',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              minWidth: 140,
            }}
          >
            {['Copy', 'Cut', 'Paste', 'Delete'].map((action) => (
              <li key={action} role="menuitem">
                <button
                  type="button"
                  data-testid={`context-action-${action.toLowerCase()}`}
                  onClick={() => choose(action)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    padding: '6px 10px',
                  }}
                >
                  {action}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
