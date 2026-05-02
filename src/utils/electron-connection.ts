import WebSocket from 'ws';
import { EXECUTE_IN_ELECTRON_RESULT_PREFIX } from '../constants';
import { CdpConnectionPool, type RuntimeEvaluateResultPayload } from './cdp-pool';
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
 * Send an arbitrary CDP method call to an Electron application.
 * Unlike executeInElectron (which only does Runtime.evaluate), this can invoke
 * any Chrome DevTools Protocol method (e.g. Input.dispatchMouseEvent).
 * @param method - CDP method name (e.g. "Input.dispatchMouseEvent")
 * @param params - Method parameters
 * @param target - Optional DevTools target to connect to
 * @returns The raw CDP result object
 * @example
 * sendCDPMethod('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 200 })
 */
export async function sendCDPMethod(
  method: string,
  params: Record<string, unknown>,
  target?: DevToolsTarget,
): Promise<any> {
  const targetInfo = target || (await findElectronTarget());

  if (!targetInfo.webSocketDebuggerUrl) {
    throw new Error('No WebSocket debugger URL available');
  }

  logger.debug(`Sending CDP method: ${method}`);
  return CdpConnectionPool.getInstance().send(targetInfo, method, params);
}

/** Options forwarded to `CdpConnectionPool.evaluate` from command handlers. */
export interface ExecuteInElectronOptions {
  /**
   * When the IIFE returns a Promise, set this to `true` so CDP waits for the
   * Promise to resolve before responding. Required by all wait/sync commands.
   */
  awaitPromise?: boolean;
  /**
   * Hard CDP-level timeout in milliseconds. Use as a safety net above any
   * in-IIFE `setTimeout` fallback (recommended: userTimeout + ~1000ms).
   */
  timeoutMs?: number;
}

/**
 * Execute JavaScript code in an Electron application via Chrome DevTools Protocol.
 * @param javascriptCode - Expression to run in the Electron renderer
 * @param target - Optional DevTools target; defaults to the first discovered window
 * @param options - Pass `awaitPromise: true` for IIFEs that return a Promise
 *   (used by wait/sync commands). `timeoutMs` enforces a hard CDP-level cap.
 * @returns Human-readable string formatted by `formatEvaluateResult`
 */
export async function executeInElectron(
  javascriptCode: string,
  target?: DevToolsTarget,
  options?: ExecuteInElectronOptions,
): Promise<string> {
  const targetInfo = target || (await findElectronTarget());

  if (!targetInfo.webSocketDebuggerUrl) {
    throw new Error('No WebSocket debugger URL available');
  }

  logger.debug(`Executing JavaScript code on ${targetInfo.title}...`);
  let payload: RuntimeEvaluateResultPayload;
  try {
    payload = await CdpConnectionPool.getInstance().evaluate(targetInfo, javascriptCode, {
      awaitPromise: options?.awaitPromise,
      timeoutMs: options?.timeoutMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`DevTools Protocol error:`, error);
    throw new Error(`DevTools Protocol error: ${message}`);
  }

  return formatEvaluateResult(payload);
}

/**
 * Translate the raw CDP `Runtime.evaluate` payload into the human-readable
 * string format that existing MCP tool handlers depend on.
 *
 * Why this lives here (and not inside the pool):
 * - The pool stays neutral about presentation. Phase 1 introduces structured
 *   `CommandResult<T>` returns; once that lands, callers can drop this helper.
 */
function formatEvaluateResult(payload: RuntimeEvaluateResultPayload): string {
  if (!payload?.result) {
    return `✅ Command sent successfully`;
  }
  const result = payload.result;
  logger.debug(`Execution result type: ${result.type}, value:`, result.value);

  switch (result.type) {
    case 'string':
      return `✅ Command executed: ${String(result.value)}`;
    case 'number':
    case 'boolean':
      return `${EXECUTE_IN_ELECTRON_RESULT_PREFIX}${String(result.value)}`;
    case 'undefined':
      return `✅ Command executed successfully`;
    case 'object': {
      if (result.value === null) return `${EXECUTE_IN_ELECTRON_RESULT_PREFIX}null`;
      if (result.value === undefined) return `${EXECUTE_IN_ELECTRON_RESULT_PREFIX}undefined`;
      try {
        return `${EXECUTE_IN_ELECTRON_RESULT_PREFIX}${JSON.stringify(result.value, null, 2)}`;
      } catch {
        return `${EXECUTE_IN_ELECTRON_RESULT_PREFIX}[Object - could not serialize: ${
          result.className || result.objectId || 'unknown'
        }]`;
      }
    }
    default:
      return `✅ Result type ${result.type}: ${result.description || 'no description'}`;
  }
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
