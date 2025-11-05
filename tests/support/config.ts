import path from 'path';

/**
 * Centralized test configuration
 * Contains all test constants, paths, and configuration values
 */
export const TEST_CONFIG = {
  // Test resource directories
  PATHS: {
    TEMP_DIR: path.join(process.cwd(), 'temp'),
    TEST_TEMP_DIR: path.join(process.cwd(), 'test-temp'),
    LOGS_DIR: path.join(process.cwd(), 'logs'),
    ELECTRON_APPS_DIR: path.join(process.cwd(), 'temp', 'electron-apps'),
  },

  // Test timeouts and limits
  TIMEOUTS: {
    ELECTRON_START: 10000,
    SCREENSHOT_CAPTURE: 5000,
    DEFAULT_TEST: 30000,
  },

  // Security test data
  SECURITY: {
    RISKY_COMMANDS: [
      'eval:require("fs").writeFileSync("/tmp/test", "malicious")',
      'eval:process.exit(1)',
      'eval:require("child_process").exec("rm -rf /")',
      'eval:Function("return process")().exit(1)',
      'eval:window.location = "javascript:alert(1)"',
      'eval:document.write("<script>alert(1)</script>")',
    ],
    MALICIOUS_PATHS: [
      '../../../etc/passwd',
      '/etc/shadow',
      '~/.ssh/id_rsa',
      'C:\\Windows\\System32\\config\\SAM',
      '/var/log/auth.log',
      '~/.bashrc',
    ],
  },

  // Electron test app configuration
  ELECTRON: {
    DEFAULT_PORT_RANGE: [9300, 9400],
    WINDOW_TITLE: 'Test Electron App',
    HTML_CONTENT: `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Electron App</title>
      </head>
      <body>
        <h1>Test Application</h1>
        <button id="test-button">Test Button</button>
        <input id="test-input" placeholder="Test input" />
        <select id="test-select">
          <option value="option1">Option 1</option>
          <option value="option2">Option 2</option>
        </select>
      </body>
      </html>
    `,
  },
} as const;

/**
 * Create a test-specific temporary directory path
 */
export function createTestTempPath(testName?: string): string {
  const timestamp = Date.now();
  const suffix = testName ? `-${testName.replace(/[^a-zA-Z0-9]/g, '-')}` : '';
  return path.join(TEST_CONFIG.PATHS.TEST_TEMP_DIR, `test-${timestamp}${suffix}`);
}

/**
 * Create an Electron app directory path
 */
export function createElectronAppPath(port: number): string {
  return path.join(TEST_CONFIG.PATHS.ELECTRON_APPS_DIR, `test-electron-${Date.now()}-${port}`);
}
