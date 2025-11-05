const { app, BrowserWindow } = require('electron');
const path = require('path');

// Enable Chrome DevTools Protocol for MCP Server
const isDev =
  process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
  console.log('🔧 Chrome DevTools Protocol enabled on port 9222');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'MCP Demo App',
  });

  win.loadFile('index.html');

  if (isDev) {
    win.webContents.openDevTools();
  }

  win.on('closed', () => {
    console.log('Window closed');
  });
}

app.whenReady().then(() => {
  console.log('🚀 MCP Demo App starting...');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
