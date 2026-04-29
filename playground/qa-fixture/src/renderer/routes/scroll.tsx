import { useEffect, useState } from 'react'

export function Scroll() {
  const [scrollX, setScrollX] = useState(0)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const viewport = document.getElementById('scroll-viewport')
    if (!viewport) return
    const handler = () => {
      setScrollX(viewport.scrollLeft)
      setScrollY(viewport.scrollTop)
    }
    viewport.addEventListener('scroll', handler)
    return () => viewport.removeEventListener('scroll', handler)
  }, [])

  return (
    <div className="section" data-testid="scroll-section">
      <h2>Scroll</h2>
      <p>
        A 3000×3000 inner area inside a 400×400 viewport. Scroll position is rendered live to
        verify <code>scroll_by_pixels</code>, <code>scroll_to_element</code>, and
        <code>get_scroll_position</code>.
      </p>
      <p>
        scrollLeft: <code data-testid="scroll-x">{scrollX}</code>, scrollTop:{' '}
        <code data-testid="scroll-y">{scrollY}</code>
      </p>
      <div
        id="scroll-viewport"
        data-testid="scroll-viewport"
        style={{
          width: 400,
          height: 400,
          overflow: 'auto',
          border: '1px solid #c0c0c2',
          borderRadius: 8,
          background: '#ffffff',
        }}
      >
        <div
          style={{
            width: 3000,
            height: 3000,
            position: 'relative',
            background:
              'repeating-linear-gradient(0deg, #f7f7f8, #f7f7f8 100px, #ffffff 100px, #ffffff 200px), repeating-linear-gradient(90deg, transparent, transparent 100px, rgba(0,0,0,0.03) 100px, rgba(0,0,0,0.03) 200px)',
          }}
        >
          <div
            data-testid="scroll-target-top-left"
            style={{ position: 'absolute', top: 0, left: 0, padding: 12, fontWeight: 600 }}
          >
            top-left
          </div>
          <div
            data-testid="scroll-target-center"
            style={{
              position: 'absolute',
              top: 1480,
              left: 1480,
              padding: 12,
              fontWeight: 600,
              background: '#ffe',
              border: '1px solid #cca',
            }}
          >
            center
          </div>
          <div
            data-testid="scroll-target-bottom-right"
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              padding: 12,
              fontWeight: 600,
              background: '#efe',
              border: '1px solid #aca',
            }}
          >
            bottom-right
          </div>
        </div>
      </div>
    </div>
  )
}
