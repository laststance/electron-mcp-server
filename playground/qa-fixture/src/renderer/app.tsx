import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

const navLinks: Array<{ to: string; label: string; testid: string }> = [
  { to: '/', label: 'Home', testid: 'nav-home' },
  { to: '/forms', label: 'Forms', testid: 'nav-forms' },
  { to: '/drag', label: 'Drag & Drop', testid: 'nav-drag' },
  { to: '/scroll', label: 'Scroll', testid: 'nav-scroll' },
  { to: '/hover', label: 'Hover', testid: 'nav-hover' },
  { to: '/storage', label: 'Storage', testid: 'nav-storage' },
  { to: '/context', label: 'Context Menu', testid: 'nav-context' },
  { to: '/secondary', label: 'Secondary', testid: 'nav-secondary' },
]

const titleByPath: Record<string, string> = {
  '/': 'QA Fixture - Primary',
  '/forms': 'QA Fixture - Forms',
  '/drag': 'QA Fixture - Drag',
  '/scroll': 'QA Fixture - Scroll',
  '/hover': 'QA Fixture - Hover',
  '/storage': 'QA Fixture - Storage',
  '/context': 'QA Fixture - Context',
  '/secondary': 'QA Fixture - Secondary',
}

export function App() {
  const location = useLocation()

  useEffect(() => {
    document.title = titleByPath[location.pathname] ?? 'QA Fixture'
  }, [location.pathname])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>QA Fixture</h1>
        <p className="app-subtitle">Current path: <code data-testid="current-path">{location.pathname}</code></p>
      </header>
      <nav className="app-nav" aria-label="QA route picker">
        {navLinks.map((link) => (
          <Link key={link.to} to={link.to} data-testid={link.testid}>
            {link.label}
          </Link>
        ))}
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
