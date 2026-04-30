import { app, Menu, MenuItemConstructorOptions, shell } from 'electron'
import { createWindow } from './window-factory'

export function buildAppMenu(unsafeMode: boolean): Menu {
  const modeLabel = unsafeMode ? 'unsafe' : 'safe'

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'QA Fixture',
      submenu: [
        {
          label: `Mode: ${modeLabel}`,
          enabled: false,
        },
        { type: 'separator' },
        {
          label: 'New Secondary Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            createWindow({
              unsafeMode,
              route: '/secondary',
              title: `QA Fixture - Secondary (${modeLabel})`,
            })
          },
        },
        {
          // In dev mode (`npm run dev`) electron-vite's cac parser strips
          // unknown CLI flags, and `app.relaunch` cannot override env vars,
          // so toggling is shown for the built-app path only. To switch in
          // dev, kill the process and re-launch with `QA_FIXTURE_UNSAFE=1`.
          label: unsafeMode ? 'Switch to safe mode (built app only)' : 'Switch to unsafe mode (built app only)',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            const filteredArgs = process.argv
              .slice(1)
              .filter(
                (arg) =>
                  arg !== '--unsafe-node-integration' &&
                  arg !== '--safe-node-integration',
              )
            const nextArgs = unsafeMode
              ? [...filteredArgs, '--safe-node-integration']
              : [...filteredArgs, '--unsafe-node-integration']
            app.relaunch({ args: nextArgs })
            app.exit(0)
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Issue #13',
          click: () => {
            shell.openExternal('https://github.com/laststance/electron-mcp-server/issues/13')
          },
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}
