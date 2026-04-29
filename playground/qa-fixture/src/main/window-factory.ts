import { BrowserWindow } from 'electron'
import { join } from 'path'

export interface CreateWindowOptions {
  unsafeMode: boolean
  route: string
  title: string
}

// DO NOT use the unsafe branch as a production reference.
// It exists solely to reproduce Issue #9 (validateEvalContent shortcircuit)
// where `process.platform` slips past the dangerous-keyword screen because
// the renderer has direct Node API access.
export function createWindow(options: CreateWindowOptions): BrowserWindow {
  const { unsafeMode, route, title } = options

  const safeWebPreferences = {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    preload: join(__dirname, '../preload/index.js'),
  }

  const unsafeWebPreferences = {
    sandbox: false,
    contextIsolation: false,
    nodeIntegration: true,
    preload: join(__dirname, '../preload/index.js'),
  }

  const window = new BrowserWindow({
    width: 1024,
    height: 720,
    title,
    webPreferences: unsafeMode ? unsafeWebPreferences : safeWebPreferences,
  })

  loadRoute(window, route)
  return window
}

function loadRoute(window: BrowserWindow, route: string): void {
  const hash = route.startsWith('#') ? route.slice(1) : route
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']

  if (devServerUrl) {
    window.loadURL(`${devServerUrl}/#${hash}`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}
