import WebSocket from 'ws';
import { scanForElectronApps, findMainTarget } from './electron-discovery';
import { logger } from './logger';

export interface DevToolsTarget {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}

export interface CommandResult {
  success: boolean;
  result?: any;
  error?: string;
  message: string;
}

/** Options for targeting a specific Electron window */
export interface WindowTargetOptions {
  /** CDP target ID (exact match) */
  targetId?: string;
  /** Window title (case-insensitive partial match) */
  windowTitle?: string;
}

/**
 * Find and connect to a running Electron application.
 * @param options - Optional targeting options to select a specific window
 * @returns The DevTools target matching the given options
 * @example
 * findElectronTarget() // first available main window
 * findElectronTarget({ targetId: 'ABC123' }) // exact ID match
 * findElectronTarget({ windowTitle: 'Settings' }) // partial title match
 */
export async function findElectronTarget(options?: WindowTargetOptions): Promise<DevToolsTarget> {
  logger.debug('Looking for running Electron applications...');

  const foundApps = await scanForElectronApps();

  if (foundApps.length === 0) {
    throw new Error(
      'No running Electron application found with remote debugging enabled. Start your app with: electron . --remote-debugging-port=9222',
    );
  }

  // If targetId is specified, search all apps for exact ID match
  if (options?.targetId) {
    for (const app of foundApps) {
      const match = app.targets.find((t: any) => t.id === options.targetId);
      if (match) {
        logger.debug(`Found target by ID "${options.targetId}" on port ${app.port}`);
        return {
          id: match.id,
          title: match.title,
          url: match.url,
          webSocketDebuggerUrl: match.webSocketDebuggerUrl,
          type: match.type,
        };
      }
    }
    throw new Error(
      `No window found with targetId "${options.targetId}". Use list_electron_windows to see available targets.`,
    );
  }

  // If windowTitle is specified, search all apps for case-insensitive partial match
  if (options?.windowTitle) {
    const searchTitle = options.windowTitle.toLowerCase();
    for (const app of foundApps) {
      const match = app.targets.find(
        (t: any) => t.title && t.title.toLowerCase().includes(searchTitle),
      );
      if (match) {
        logger.debug(`Found target by title "${options.windowTitle}" on port ${app.port}`);
        return {
          id: match.id,
          title: match.title,
          url: match.url,
          webSocketDebuggerUrl: match.webSocketDebuggerUrl,
          type: match.type,
        };
      }
    }
    throw new Error(
      `No window found with title matching "${options.windowTitle}". Use list_electron_windows to see available targets.`,
    );
  }

  // Default: use first app's main target (backward compatible)
  const app = foundApps[0];
  const mainTarget = findMainTarget(app.targets);

  if (!mainTarget) {
    throw new Error('No suitable target found in Electron application');
  }

  logger.debug(`Found Electron app on port ${app.port}: ${mainTarget.title}`);

  return {
    id: mainTarget.id,
    title: mainTarget.title,
    url: mainTarget.url,
    webSocketDebuggerUrl: mainTarget.webSocketDebuggerUrl,
    type: mainTarget.type,
  };
}

/**
 * Execute JavaScript code in an Electron application via Chrome DevTools Protocol
 */
export async function executeInElectron(
  javascriptCode: string,
  target?: DevToolsTarget,
): Promise<string> {
  const targetInfo = target || (await findElectronTarget());

  if (!targetInfo.webSocketDebuggerUrl) {
    throw new Error('No WebSocket debugger URL available');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
    const messageId = Math.floor(Math.random() * 1000000);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Command execution timeout (10s)'));
    }, 10000);

    ws.on('open', () => {
      logger.debug(`Connected to ${targetInfo.title} via WebSocket`);

      // Enable Runtime domain first
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.enable',
        }),
      );

      // Send Runtime.evaluate command
      const message = {
        id: messageId,
        method: 'Runtime.evaluate',
        params: {
          expression: javascriptCode,
          returnByValue: true,
          awaitPromise: false,
        },
      };

      logger.debug(`Executing JavaScript code...`);
      ws.send(JSON.stringify(message));
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());

        // Filter out noisy CDP events to reduce log spam
        const FILTERED_CDP_METHODS = [
          'Runtime.executionContextCreated',
          'Runtime.consoleAPICalled',
          'Console.messageAdded',
          'Page.frameNavigated',
          'Page.loadEventFired',
        ];

        // Only log CDP events if debug level is enabled and they're not filtered
        if (
          logger.isEnabled(3) &&
          (!response.method || !FILTERED_CDP_METHODS.includes(response.method))
        ) {
          logger.debug(`CDP Response for message ${messageId}:`, JSON.stringify(response, null, 2));
        }

        if (response.id === messageId) {
          clearTimeout(timeout);
          ws.close();

          if (response.error) {
            logger.error(`DevTools Protocol error:`, response.error);
            reject(new Error(`DevTools Protocol error: ${response.error.message}`));
          } else if (response.result) {
            const result = response.result.result;
            logger.debug(`Execution result type: ${result?.type}, value:`, result?.value);

            if (result.type === 'string') {
              resolve(`✅ Command executed: ${result.value}`);
            } else if (result.type === 'number') {
              resolve(`✅ Result: ${result.value}`);
            } else if (result.type === 'boolean') {
              resolve(`✅ Result: ${result.value}`);
            } else if (result.type === 'undefined') {
              resolve(`✅ Command executed successfully`);
            } else if (result.type === 'object') {
              if (result.value === null) {
                resolve(`✅ Result: null`);
              } else if (result.value === undefined) {
                resolve(`✅ Result: undefined`);
              } else {
                try {
                  resolve(`✅ Result: ${JSON.stringify(result.value, null, 2)}`);
                } catch {
                  resolve(
                    `✅ Result: [Object - could not serialize: ${
                      result.className || result.objectId || 'unknown'
                    }]`,
                  );
                }
              }
            } else {
              resolve(`✅ Result type ${result.type}: ${result.description || 'no description'}`);
            }
          } else {
            logger.debug(`No result in response:`, response);
            resolve(`✅ Command sent successfully`);
          }
        }
      } catch (error) {
        // Only treat parsing errors as warnings, not errors
        logger.warn(`Failed to parse CDP response:`, error);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${error.message}`));
    });
  });
}

/**
 * Connect to Electron app for real-time log monitoring
 */
export async function connectForLogs(
  target?: DevToolsTarget,
  onLog?: (log: string) => void,
): Promise<WebSocket> {
  const targetInfo = target || (await findElectronTarget());

  if (!targetInfo.webSocketDebuggerUrl) {
    throw new Error('No WebSocket debugger URL available for log connection');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(targetInfo.webSocketDebuggerUrl);

    ws.on('open', () => {
      logger.debug(`Connected for log monitoring to: ${targetInfo.title}`);

      // Enable Runtime and Console domains
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Console.enable' }));

      resolve(ws);
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());

        if (response.method === 'Console.messageAdded') {
          const msg = response.params.message;
          const timestamp = new Date().toISOString();
          const logEntry = `[${timestamp}] ${msg.level.toUpperCase()}: ${msg.text}`;
          onLog?.(logEntry);
        } else if (response.method === 'Runtime.consoleAPICalled') {
          const call = response.params;
          const timestamp = new Date().toISOString();
          const args = call.args?.map((arg: any) => arg.value || arg.description).join(' ') || '';
          const logEntry = `[${timestamp}] ${call.type.toUpperCase()}: ${args}`;
          onLog?.(logEntry);
        }
      } catch (error) {
        logger.warn(`Failed to parse log message:`, error);
      }
    });

    ws.on('error', (error) => {
      reject(new Error(`WebSocket error: ${error.message}`));
    });
  });
}
