import WebSocket from 'ws';
import { CDP_CONNECT_TIMEOUT_MS, CDP_POOL_MESSAGE_ID_START, CDP_TIMEOUT_MS } from '../constants';
import type { DevToolsTarget } from './electron-connection';
import { logger } from './logger';

/**
 * Result payload of a `Runtime.evaluate` call returned by CDP.
 * See https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate
 */
export interface RuntimeEvaluateResultPayload {
  result: {
    type:
      | 'string'
      | 'number'
      | 'boolean'
      | 'undefined'
      | 'object'
      | 'function'
      | 'symbol'
      | 'bigint';
    value?: unknown;
    description?: string;
    className?: string;
    objectId?: string;
    subtype?: string;
  };
  exceptionDetails?: {
    text: string;
    exception?: { description?: string; value?: unknown };
  };
}

/** A pending CDP request waiting for its matching response. */
interface PendingMessage {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutHandle: NodeJS.Timeout;
  method: string;
}

/** A single multiplexed CDP connection managed by the pool. */
interface PooledConnection {
  ws: WebSocket;
  target: DevToolsTarget;
  pendingMessages: Map<number, PendingMessage>;
  nextMessageId: number;
  enabledDomains: Set<string>;
  isClosing: boolean;
}

/** Options passed to `CdpConnectionPool.send`. */
export interface CdpSendOptions {
  /** Override the default request timeout (ms). */
  timeoutMs?: number;
}

/** Options passed to `CdpConnectionPool.evaluate`. */
export interface CdpEvaluateOptions extends CdpSendOptions {
  /** Block until any returned Promise resolves (CDP `awaitPromise`). */
  awaitPromise?: boolean;
  /** Serialize result by value (CDP `returnByValue`). Default true. */
  returnByValue?: boolean;
  /** Optional userGesture flag for trusted UI events. */
  userGesture?: boolean;
}

/**
 * Singleton pool of long-lived CDP WebSocket connections.
 *
 * Why this exists:
 * - The previous `electron-connection.ts` opened a fresh WebSocket per call
 *   (~50 connections / 5 seconds for `wait_*` polling). That is unsustainable
 *   and incompatible with `MutationObserver` based primitives that need a
 *   long-lived connection for streaming events.
 * - This pool keeps one WebSocket per CDP target, multiplexes requests using
 *   monotonic message IDs, caches `Runtime.enable` per connection, and routes
 *   responses back to the right caller through a pendingMessages map.
 *
 * Reconnection policy: callers retry on failure. The pool removes a broken
 * connection from its cache so the *next* `getConnection` opens a new socket.
 */
export class CdpConnectionPool {
  private static instance: CdpConnectionPool | null = null;

  /**
   * Storing `Promise<PooledConnection>` (not `PooledConnection`) prevents the
   * race where two concurrent callers both see the cache miss and each open a
   * WebSocket. The first caller writes the in-flight Promise; the second
   * caller awaits the same Promise.
   */
  private connections = new Map<string, Promise<PooledConnection>>();

  static getInstance(): CdpConnectionPool {
    if (!CdpConnectionPool.instance) {
      CdpConnectionPool.instance = new CdpConnectionPool();
    }
    return CdpConnectionPool.instance;
  }

  /**
   * Reset the singleton. ONLY used by tests — production code never calls this.
   * @internal
   */
  static resetForTesting(): void {
    CdpConnectionPool.instance = null;
  }

  /**
   * Get (or create) the pooled connection for a target.
   * Concurrent calls for the same target share the same in-flight Promise.
   */
  async getConnection(target: DevToolsTarget): Promise<PooledConnection> {
    if (!target.webSocketDebuggerUrl) {
      throw new Error('Target has no webSocketDebuggerUrl');
    }
    const cached = this.connections.get(target.id);
    if (cached) return cached;

    const opening = this.openConnection(target);
    this.connections.set(target.id, opening);
    try {
      return await opening;
    } catch (error) {
      // Eviction: failed Promise must not stick in the cache.
      this.connections.delete(target.id);
      throw error;
    }
  }

  /**
   * Send any CDP method on the pooled connection.
   * @returns The CDP `result` payload (caller decides shape).
   * @example
   * pool.send(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y })
   */
  async send(
    target: DevToolsTarget,
    method: string,
    params: Record<string, unknown> = {},
    options: CdpSendOptions = {},
  ): Promise<unknown> {
    const conn = await this.getConnection(target);
    return this.sendOnConnection(conn, method, params, options);
  }

  /**
   * Convenience wrapper around `Runtime.evaluate` with sensible defaults
   * (`returnByValue: true`, `awaitPromise: false`).
   */
  async evaluate(
    target: DevToolsTarget,
    expression: string,
    options: CdpEvaluateOptions = {},
  ): Promise<RuntimeEvaluateResultPayload> {
    const conn = await this.getConnection(target);
    await this.ensureDomainEnabled(conn, 'Runtime');

    const params: Record<string, unknown> = {
      expression,
      returnByValue: options.returnByValue ?? true,
      awaitPromise: options.awaitPromise ?? false,
    };
    if (options.userGesture) params.userGesture = true;

    return (await this.sendOnConnection(conn, 'Runtime.evaluate', params, {
      timeoutMs: options.timeoutMs,
    })) as RuntimeEvaluateResultPayload;
  }

  /**
   * Ensure a CDP domain (`Runtime`, `Console`, `Page`, ...) is enabled on the
   * connection. Idempotent: subsequent calls for the same domain are no-ops.
   */
  async ensureDomainEnabled(conn: PooledConnection, domain: string): Promise<void> {
    if (conn.enabledDomains.has(domain)) return;
    await this.sendOnConnection(conn, `${domain}.enable`, {}, {});
    conn.enabledDomains.add(domain);
  }

  /** Close a single connection (e.g. after the underlying target disappears). */
  async close(targetId: string): Promise<void> {
    const cached = this.connections.get(targetId);
    if (!cached) return;
    this.connections.delete(targetId);
    try {
      const conn = await cached;
      this.terminateConnection(conn, new Error('Connection closed by pool'));
    } catch {
      // open failed — nothing to terminate
    }
  }

  /** Close every pooled connection. Used on shutdown / test teardown. */
  async closeAll(): Promise<void> {
    const ids = Array.from(this.connections.keys());
    await Promise.all(ids.map((id) => this.close(id)));
  }

  // ------------------------------------------------------------------
  // private
  // ------------------------------------------------------------------

  private openConnection(target: DevToolsTarget): Promise<PooledConnection> {
    return new Promise<PooledConnection>((resolve, reject) => {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      const conn: PooledConnection = {
        ws,
        target,
        pendingMessages: new Map(),
        nextMessageId: CDP_POOL_MESSAGE_ID_START,
        enabledDomains: new Set(),
        isClosing: false,
      };

      const connectTimeout = setTimeout(() => {
        ws.close();
        reject(new Error(`CDP connect timeout (${CDP_CONNECT_TIMEOUT_MS}ms): ${target.id}`));
      }, CDP_CONNECT_TIMEOUT_MS);

      ws.on('open', () => {
        clearTimeout(connectTimeout);
        logger.debug(`CDP pool: opened connection to ${target.title} (${target.id})`);
        resolve(conn);
      });

      ws.on('message', (data) => this.dispatchMessage(conn, data));

      ws.on('close', () => {
        this.handleConnectionClosed(conn, new Error('WebSocket closed'));
      });

      ws.on('error', (error) => {
        clearTimeout(connectTimeout);
        const wrapped = new Error(`WebSocket error: ${error.message}`);
        if (this.connections.get(target.id)) {
          // Already open — surface to in-flight requests via close handler.
          this.handleConnectionClosed(conn, wrapped);
        }
        reject(wrapped);
      });
    });
  }

  private sendOnConnection(
    conn: PooledConnection,
    method: string,
    params: Record<string, unknown>,
    options: CdpSendOptions,
  ): Promise<unknown> {
    if (conn.isClosing || conn.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP connection unavailable for ${method}`));
    }
    const id = conn.nextMessageId++;
    const timeoutMs = options.timeoutMs ?? CDP_TIMEOUT_MS;

    return new Promise<unknown>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        conn.pendingMessages.delete(id);
        reject(new Error(`CDP method timeout (${timeoutMs}ms): ${method}`));
      }, timeoutMs);

      conn.pendingMessages.set(id, { resolve, reject, timeoutHandle, method });

      try {
        conn.ws.send(JSON.stringify({ id, method, params }));
      } catch (sendError) {
        clearTimeout(timeoutHandle);
        conn.pendingMessages.delete(id);
        reject(sendError instanceof Error ? sendError : new Error(String(sendError)));
      }
    });
  }

  private dispatchMessage(conn: PooledConnection, data: WebSocket.RawData): void {
    let response: { id?: number; result?: unknown; error?: { message: string } };
    try {
      response = JSON.parse(data.toString());
    } catch (error) {
      logger.warn('CDP pool: failed to parse message', error);
      return;
    }

    if (typeof response.id !== 'number') {
      // Event (e.g. Runtime.consoleAPICalled). Pool ignores; subscribers can
      // attach their own listener to the underlying ws if needed.
      return;
    }

    const pending = conn.pendingMessages.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeoutHandle);
    conn.pendingMessages.delete(response.id);

    if (response.error) {
      pending.reject(new Error(`CDP error (${pending.method}): ${response.error.message}`));
      return;
    }
    pending.resolve(response.result ?? null);
  }

  private handleConnectionClosed(conn: PooledConnection, reason: Error): void {
    if (conn.isClosing) return;
    conn.isClosing = true;
    this.connections.delete(conn.target.id);
    for (const pending of conn.pendingMessages.values()) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(reason);
    }
    conn.pendingMessages.clear();
  }

  private terminateConnection(conn: PooledConnection, reason: Error): void {
    this.handleConnectionClosed(conn, reason);
    try {
      conn.ws.close();
    } catch {
      // best-effort
    }
  }
}
