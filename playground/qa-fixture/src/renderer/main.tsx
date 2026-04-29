import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { App } from './app'
import { Home } from './routes/home'
import { Forms } from './routes/forms'
import { Drag } from './routes/drag'
import { Scroll } from './routes/scroll'
import { Hover } from './routes/hover'
import { Storage } from './routes/storage'
import { Context } from './routes/context'
import { Secondary } from './routes/secondary'
import './app.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root missing in index.html')

createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Home />} />
          <Route path="forms" element={<Forms />} />
          <Route path="drag" element={<Drag />} />
          <Route path="scroll" element={<Scroll />} />
          <Route path="hover" element={<Hover />} />
          <Route path="storage" element={<Storage />} />
          <Route path="context" element={<Context />} />
          <Route path="secondary" element={<Secondary />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
)
