import { app, Menu } from 'electron'
import { createWindow } from './window-factory'
import { buildAppMenu } from './menu'

// Two ways to enter unsafe mode:
//   1. CLI flag (works when launching the built app directly with `electron .`)
//   2. Env var QA_FIXTURE_UNSAFE=1 (works through electron-vite dev, which
//      otherwise rejects unknown CLI flags via its cac parser)
//
// CLI flags take precedence over the env var so that menu-driven relaunch
// (`Cmd+Shift+N`) can flip back to safe mode by appending `--safe-node-integration`,
// even when the original launch supplied QA_FIXTURE_UNSAFE=1.
const hasUnsafeFlag = process.argv.includes('--unsafe-node-integration')
const hasSafeFlag = process.argv.includes('--safe-node-integration')
const unsafeMode =
  hasUnsafeFlag || (!hasSafeFlag && process.env.QA_FIXTURE_UNSAFE === '1')
const modeLabel = unsafeMode ? 'unsafe' : 'safe'

// CDP 9223 keeps this fixture isolated from skills-desktop on 9222 and is
// already in the MCP server's commonPorts scan list (electron-discovery.ts).
app.commandLine.appendSwitch('remote-debugging-port', '9223')

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu(unsafeMode))
  createWindow({
    unsafeMode,
    route: '/',
    title: `QA Fixture - Primary (${modeLabel})`,
  })

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and no windows are open
    const { BrowserWindow } = require('electron') as typeof import('electron')
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow({
        unsafeMode,
        route: '/',
        title: `QA Fixture - Primary (${modeLabel})`,
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
