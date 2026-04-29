import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fake WebSocket for unit tests.
 *
 * Defined via `vi.hoisted` so it is initialized BEFORE the hoisted `vi.mock`
 * factory runs. Without hoisting, the factory closure tries to capture
 * `FakeWebSocket` while it is still in the temporal dead zone.
 *
 * Mirrors the subset of `ws.WebSocket` that CdpConnectionPool touches:
 * - `on('open' | 'message' | 'close' | 'error', cb)`
 * - `send(data)`
 * - `close()`
 * - `readyState`
 *
 * Tests drive lifecycle via `simulateOpen`, `simulateMessage`,
 * `simulateClose`, `simulateError`.
 */
const { FakeWebSocket } = vi.hoisted(() => {
  // Imported inside the hoisted block so it is available before `vi.mock`.
  const { EventEmitter } = require('events');

  class FakeWebSocketImpl extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    static instances: FakeWebSocketImpl[] = [];

    readyState = FakeWebSocketImpl.CONNECTING;
    url: string;
    sent: string[] = [];

    constructor(url: string) {
      super();
      this.url = url;
      FakeWebSocketImpl.instances.push(this);
    }

    send(data: string): void {
      this.sent.push(data);
    }

    close(): void {
      if (this.readyState === FakeWebSocketImpl.CLOSED) return;
      this.readyState = FakeWebSocketImpl.CLOSED;
      queueMicrotask(() => this.emit('close'));
    }

    // ---- test helpers ----
    simulateOpen(): void {
      this.readyState = FakeWebSocketImpl.OPEN;
      this.emit('open');
    }

    simulateMessage(payload: object): void {
      this.emit('message', Buffer.from(JSON.stringify(payload)));
    }

    simulateClose(): void {
      this.readyState = FakeWebSocketImpl.CLOSED;
      this.emit('close');
    }

    simulateError(message: string): void {
      this.emit('error', new Error(message));
    }

    static reset(): void {
      FakeWebSocketImpl.instances = [];
    }

    static last(): FakeWebSocketImpl {
      const instance = FakeWebSocketImpl.instances.at(-1);
      if (!instance) throw new Error('No FakeWebSocket instances created');
      return instance;
    }
  }
  return { FakeWebSocket: FakeWebSocketImpl };
});

vi.mock('ws', () => ({
  default: FakeWebSocket,
  WebSocket: FakeWebSocket,
}));

import { CdpConnectionPool } from '../../src/utils/cdp-pool';
import type { DevToolsTarget } from '../../src/utils/electron-connection';

const buildTarget = (id = 'target-1'): DevToolsTarget => ({
  id,
  title: `Window ${id}`,
  url: 'file:///app/index.html',
  type: 'page',
  webSocketDebuggerUrl: `ws://localhost:9222/devtools/page/${id}`,
});

/** Wait for the next macrotask so queued microtasks (`queueMicrotask`) flush. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Wait until the fake WebSocket has captured at least `count` outbound
 * messages. `pool.send` chains `await getConnection -> sendOnConnection`, so
 * synchronous reads of `ws.sent` immediately after starting a request observe
 * an empty array. Polling the array is the simplest way to bridge that gap.
 */
async function waitForSent(
  ws: { sent: string[] },
  count: number,
  timeoutMs = 200,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (ws.sent.length < count) {
    if (Date.now() > deadline) {
      throw new Error(`waitForSent: only ${ws.sent.length}/${count} after ${timeoutMs}ms`);
    }
    await tick();
  }
}

describe('CdpConnectionPool', () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    CdpConnectionPool.resetForTesting();
  });

  afterEach(async () => {
    await CdpConnectionPool.getInstance().closeAll();
    CdpConnectionPool.resetForTesting();
  });

  describe('singleton', () => {
    it('returns the same instance across getInstance calls', () => {
      const a = CdpConnectionPool.getInstance();
      const b = CdpConnectionPool.getInstance();
      expect(a).toBe(b);
    });

    it('resetForTesting clears the singleton (used only by tests)', () => {
      const a = CdpConnectionPool.getInstance();
      CdpConnectionPool.resetForTesting();
      const b = CdpConnectionPool.getInstance();
      expect(a).not.toBe(b);
    });
  });

  describe('getConnection() race protection', () => {
    it('shares the same in-flight Promise for concurrent getConnection calls', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();

      const p1 = pool.getConnection(target);
      const p2 = pool.getConnection(target);

      // Only one WebSocket should be created despite two callers.
      expect(FakeWebSocket.instances).toHaveLength(1);

      FakeWebSocket.last().simulateOpen();

      const [conn1, conn2] = await Promise.all([p1, p2]);
      expect(conn1).toBe(conn2);
    });

    it('opens a new WebSocket for a different target', async () => {
      const pool = CdpConnectionPool.getInstance();
      const t1 = buildTarget('target-A');
      const t2 = buildTarget('target-B');

      const p1 = pool.getConnection(t1);
      const p2 = pool.getConnection(t2);

      expect(FakeWebSocket.instances).toHaveLength(2);
      FakeWebSocket.instances[0].simulateOpen();
      FakeWebSocket.instances[1].simulateOpen();

      const [c1, c2] = await Promise.all([p1, p2]);
      expect(c1).not.toBe(c2);
      expect(c1.target.id).toBe('target-A');
      expect(c2.target.id).toBe('target-B');
    });

    it('evicts a failed Promise so later calls re-open', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();

      const failing = pool.getConnection(target);
      FakeWebSocket.last().simulateError('boom');

      await expect(failing).rejects.toThrow(/boom/);

      // After failure, the cache must be empty so a retry opens a new socket.
      const retry = pool.getConnection(target);
      expect(FakeWebSocket.instances).toHaveLength(2);
      FakeWebSocket.last().simulateOpen();
      await retry;
    });

    it('rejects when the target has no webSocketDebuggerUrl', async () => {
      const pool = CdpConnectionPool.getInstance();
      const broken = { ...buildTarget(), webSocketDebuggerUrl: '' };
      await expect(pool.getConnection(broken)).rejects.toThrow(/webSocketDebuggerUrl/);
    });
  });

  describe('send() multiplexing', () => {
    it('routes responses to the right pending request by id', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();

      const opening = pool.getConnection(target);
      FakeWebSocket.last().simulateOpen();
      await opening;

      const ws = FakeWebSocket.last();

      // Fire two requests in parallel — pool assigns ids 1 and 2.
      const p1 = pool.send(target, 'A.method', { x: 1 });
      const p2 = pool.send(target, 'B.method', { y: 2 });

      await waitForSent(ws, 2);
      const sent1 = JSON.parse(ws.sent[0]);
      const sent2 = JSON.parse(ws.sent[1]);
      expect(sent1.id).toBe(1);
      expect(sent2.id).toBe(2);
      expect(sent1.method).toBe('A.method');
      expect(sent2.method).toBe('B.method');

      // Reply OUT OF ORDER — second reply first.
      ws.simulateMessage({ id: sent2.id, result: { from: 'B' } });
      ws.simulateMessage({ id: sent1.id, result: { from: 'A' } });

      await expect(p1).resolves.toEqual({ from: 'A' });
      await expect(p2).resolves.toEqual({ from: 'B' });
    });

    it('rejects with a CDP error message when the protocol returns an error', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();
      const opening = pool.getConnection(target);
      FakeWebSocket.last().simulateOpen();
      await opening;
      const ws = FakeWebSocket.last();

      const pending = pool.send(target, 'Bad.method', {});
      await waitForSent(ws, 1);
      const sent = JSON.parse(ws.sent[0]);
      ws.simulateMessage({ id: sent.id, error: { message: 'invalid params' } });

      await expect(pending).rejects.toThrow(/CDP error \(Bad\.method\): invalid params/);
    });

    it('ignores CDP events (messages with no id)', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();
      const opening = pool.getConnection(target);
      FakeWebSocket.last().simulateOpen();
      await opening;
      const ws = FakeWebSocket.last();

      // An event without `id` would crash a naive dispatcher.
      expect(() =>
        ws.simulateMessage({ method: 'Runtime.consoleAPICalled', params: {} }),
      ).not.toThrow();
    });
  });

  describe('send() timeout', () => {
    it('rejects with a timeout error when no response arrives', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();
      const opening = pool.getConnection(target);
      FakeWebSocket.last().simulateOpen();
      await opening;

      // Use a real but tiny timeout to keep the test in real-timer mode.
      // Fake timers do not pump microtasks the way the pool's sequential
      // `await getConnection -> sendOnConnection` chain expects.
      const pending = pool.send(target, 'Slow.method', {}, { timeoutMs: 20 });
      await expect(pending).rejects.toThrow(/CDP method timeout \(20ms\): Slow\.method/);
    });
  });

  describe('evaluate() helper', () => {
    it('enables Runtime exactly once across multiple evaluates', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();
      const opening = pool.getConnection(target);
      FakeWebSocket.last().simulateOpen();
      await opening;
      const ws = FakeWebSocket.last();

      const e1 = pool.evaluate(target, '1 + 1');
      // First message: Runtime.enable
      await waitForSent(ws, 1);
      const enable = JSON.parse(ws.sent[0]);
      expect(enable.method).toBe('Runtime.enable');
      ws.simulateMessage({ id: enable.id, result: {} });

      // Second message: Runtime.evaluate (only after enable resolves)
      await waitForSent(ws, 2);
      const evaluate1 = JSON.parse(ws.sent[1]);
      expect(evaluate1.method).toBe('Runtime.evaluate');
      expect(evaluate1.params.expression).toBe('1 + 1');
      ws.simulateMessage({
        id: evaluate1.id,
        result: { result: { type: 'number', value: 2 } },
      });
      await expect(e1).resolves.toEqual({ result: { type: 'number', value: 2 } });

      // Second evaluate must NOT re-send Runtime.enable.
      const e2 = pool.evaluate(target, '2 + 2');
      await waitForSent(ws, 3);
      const evaluate2 = JSON.parse(ws.sent[2]);
      expect(evaluate2.method).toBe('Runtime.evaluate');
      ws.simulateMessage({
        id: evaluate2.id,
        result: { result: { type: 'number', value: 4 } },
      });
      await e2;

      const enableCount = ws.sent.filter((s) => JSON.parse(s).method === 'Runtime.enable').length;
      expect(enableCount).toBe(1);
    });

    it('honors awaitPromise and returnByValue overrides', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();
      const opening = pool.getConnection(target);
      FakeWebSocket.last().simulateOpen();
      await opening;
      const ws = FakeWebSocket.last();

      const pending = pool.evaluate(target, 'asyncCall()', {
        awaitPromise: true,
        returnByValue: false,
      });
      await waitForSent(ws, 1);
      const enable = JSON.parse(ws.sent[0]);
      ws.simulateMessage({ id: enable.id, result: {} });

      await waitForSent(ws, 2);
      const evaluate = JSON.parse(ws.sent[1]);
      expect(evaluate.params.awaitPromise).toBe(true);
      expect(evaluate.params.returnByValue).toBe(false);

      ws.simulateMessage({
        id: evaluate.id,
        result: { result: { type: 'object', objectId: 'X' } },
      });
      await pending;
    });
  });

  describe('connection lifecycle', () => {
    it('rejects in-flight requests when the underlying WebSocket closes', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();
      const opening = pool.getConnection(target);
      FakeWebSocket.last().simulateOpen();
      await opening;
      const ws = FakeWebSocket.last();

      const pending = pool.send(target, 'Slow.method', {});
      // Wait for the request to register before closing — if we close first,
      // the next-send guard rejects with "CDP connection unavailable" instead.
      await waitForSent(ws, 1);
      ws.simulateClose();

      await expect(pending).rejects.toThrow(/WebSocket closed/);
    });

    it('removes a closed connection from the cache', async () => {
      const pool = CdpConnectionPool.getInstance();
      const target = buildTarget();
      const opening = pool.getConnection(target);
      FakeWebSocket.last().simulateOpen();
      await opening;
      const ws = FakeWebSocket.last();

      ws.simulateClose();
      // Allow microtasks to drain so handleConnectionClosed runs.
      await tick();

      // Next call must open a fresh WebSocket.
      const reopen = pool.getConnection(target);
      expect(FakeWebSocket.instances).toHaveLength(2);
      FakeWebSocket.last().simulateOpen();
      await reopen;
    });

    it('closeAll() terminates every pooled connection', async () => {
      const pool = CdpConnectionPool.getInstance();
      const t1 = buildTarget('A');
      const t2 = buildTarget('B');
      const o1 = pool.getConnection(t1);
      const o2 = pool.getConnection(t2);
      FakeWebSocket.instances[0].simulateOpen();
      FakeWebSocket.instances[1].simulateOpen();
      await Promise.all([o1, o2]);

      await pool.closeAll();

      // After closeAll, asking for either target opens a brand new socket.
      const reopen = pool.getConnection(t1);
      expect(FakeWebSocket.instances).toHaveLength(3);
      FakeWebSocket.last().simulateOpen();
      await reopen;
    });
  });
});
