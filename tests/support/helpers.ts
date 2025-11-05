import { rmSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { logger } from '../../src/utils/logger';
import { TEST_CONFIG, createElectronAppPath } from './config';
import { spawn, ChildProcess } from 'child_process';
import { createServer } from 'net';

export interface TestElectronApp {
  port: number;
  process: ChildProcess;
  appPath: string;
  cleanup: () => Promise<void>;
}

export interface CleanupOptions {
  removeLogsDir?: boolean;
  removeTempDir?: boolean;
  preserveKeys?: boolean;
}

/**
 * Consolidated test helpers and utilities
 */
export class TestHelpers {
  /**
   * Create and start a test Electron application
   */
  static async createTestElectronApp(): Promise<TestElectronApp> {
    const port = await this.findAvailablePort();
    const appPath = createElectronAppPath(port);

    // Create app directory and files
    mkdirSync(appPath, { recursive: true });

    // Create package.json
    const packageJson = {
      name: 'test-electron-app',
      version: '1.0.0',
      main: 'main.js',
      scripts: {
        start: 'electron .',
      },
    };
    writeFileSync(join(appPath, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Create main.js
    const mainJs = `
      const { app, BrowserWindow } = require('electron');
      const path = require('path');
      
      let mainWindow;
      
      app.commandLine.appendSwitch('remote-debugging-port', '${port}');
      app.commandLine.appendSwitch('no-sandbox');
      app.commandLine.appendSwitch('disable-web-security');
      
      function createWindow() {
        mainWindow = new BrowserWindow({
          width: 800,
          height: 600,
          show: false, // Keep hidden for testing
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
          }
        });
        
        mainWindow.setTitle('${TEST_CONFIG.ELECTRON.WINDOW_TITLE}');
        mainWindow.loadFile('index.html');
        
        mainWindow.webContents.once('did-finish-load', () => {
          console.log('[TEST-APP] Window ready, staying hidden for testing');
        });
      }
      
      app.whenReady().then(() => {
        createWindow();
        console.log('[TEST-APP] Electron app ready with remote debugging on port ${port}');
      });
      
      app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
          app.quit();
        }
      });
    `;
    writeFileSync(join(appPath, 'main.js'), mainJs);

    // Create index.html
    writeFileSync(join(appPath, 'index.html'), TEST_CONFIG.ELECTRON.HTML_CONTENT);

    // Start the Electron process
    const electronProcess = spawn('npx', ['electron', '.'], {
      cwd: appPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const app: TestElectronApp = {
      port,
      process: electronProcess,
      appPath,
      cleanup: async () => {
        electronProcess.kill();
        if (existsSync(appPath)) {
          rmSync(appPath, { recursive: true, force: true });
        }
      },
    };

    // Wait for app to be ready
    await this.waitForElectronApp(app);

    return app;
  }

  /**
   * Wait for Electron app to be ready for testing
   */
  static async waitForElectronApp(
    app: TestElectronApp,
    timeout = TEST_CONFIG.TIMEOUTS.ELECTRON_START,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkReady = async () => {
        try {
          const response = await fetch(`http://localhost:${app.port}/json`);
          if (response.ok) {
            logger.info(`✅ Test Electron app ready for integration and security testing`);
            resolve();
            return;
          }
        } catch {
          // App not ready yet
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error(`Electron app failed to start within ${timeout}ms`));
          return;
        }

        setTimeout(checkReady, 100);
      };

      checkReady();
    });
  }

  /**
   * Find an available port in the configured range
   */
  private static async findAvailablePort(): Promise<number> {
    const [start, end] = TEST_CONFIG.ELECTRON.DEFAULT_PORT_RANGE;

    for (let port = start; port <= end; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }

    throw new Error(`No available ports in range ${start}-${end}`);
  }

  /**
   * Check if a port is available
   */
  private static async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();

      server.listen(port, () => {
        server.close(() => resolve(true));
      });

      server.on('error', () => resolve(false));
    });
  }

  /**
   * Clean up test artifacts and temporary files
   */
  static async cleanup(options: CleanupOptions = {}): Promise<void> {
    const { removeLogsDir = true, removeTempDir = true, preserveKeys = false } = options;

    try {
      // Clean up logs directory
      if (removeLogsDir && existsSync(basename(TEST_CONFIG.PATHS.LOGS_DIR))) {
        if (preserveKeys) {
          this.cleanupLogsPreservingKeys();
        } else {
          rmSync(basename(TEST_CONFIG.PATHS.LOGS_DIR), { recursive: true, force: true });
          logger.info(`🧹 Cleaned up logs directory`);
        }
      }

      // Clean up temp directories
      if (removeTempDir) {
        [basename(TEST_CONFIG.PATHS.TEMP_DIR), basename(TEST_CONFIG.PATHS.TEST_TEMP_DIR)].forEach(
          (dir) => {
            if (existsSync(dir)) {
              rmSync(dir, { recursive: true, force: true });
              logger.info(`🧹 Cleaned up ${dir} directory`);
            }
          },
        );
      }
    } catch (error) {
      logger.error('Failed to cleanup test artifacts:', error);
    }
  }

  /**
   * Clean up only log files while preserving encryption keys
   */
  private static cleanupLogsPreservingKeys(): void {
    try {
      const securityDir = join(basename(TEST_CONFIG.PATHS.LOGS_DIR), 'security');
      if (existsSync(securityDir)) {
        const files = readdirSync(securityDir);

        files.forEach((file: string) => {
          if (file.endsWith('.log')) {
            const filePath = join(securityDir, file);
            rmSync(filePath, { force: true });
            logger.info(`🧹 Cleaned up log file: ${filePath}`);
          }
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup log files:', error);
    }
  }

  /**
   * Get size of artifacts that would be cleaned up
   */
  static getCleanupSize(): { logs: number; temp: number; total: number } {
    let logsSize = 0;
    let tempSize = 0;

    try {
      const logsDir = basename(TEST_CONFIG.PATHS.LOGS_DIR);
      if (existsSync(logsDir)) {
        logsSize = this.getDirectorySize(logsDir);
      }

      [basename(TEST_CONFIG.PATHS.TEMP_DIR), basename(TEST_CONFIG.PATHS.TEST_TEMP_DIR)].forEach(
        (dir) => {
          if (existsSync(dir)) {
            tempSize += this.getDirectorySize(dir);
          }
        },
      );
    } catch (error) {
      logger.error('Failed to calculate cleanup size:', error);
    }

    return {
      logs: logsSize,
      temp: tempSize,
      total: logsSize + tempSize,
    };
  }

  /**
   * Calculate directory size in bytes
   */
  private static getDirectorySize(dirPath: string): number {
    let totalSize = 0;

    try {
      const items = readdirSync(dirPath);

      for (const item of items) {
        const itemPath = join(dirPath, item);
        const stats = statSync(itemPath);

        if (stats.isDirectory()) {
          totalSize += this.getDirectorySize(itemPath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (_error) {
      // Directory might not exist or be accessible
    }

    return totalSize;
  }

  /**
   * Create a proper MCP request format for testing
   */
  static createMCPRequest(toolName: string, args: any = {}) {
    return {
      method: 'tools/call' as const,
      params: {
        name: toolName,
        arguments: args,
      },
    };
  }
}
