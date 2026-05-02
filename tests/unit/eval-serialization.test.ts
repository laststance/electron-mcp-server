import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the CDP pool BEFORE importing executeInElectron so the module sees
// the mocked singleton.
const evaluateMock = vi.hoisted(() =>
  vi.fn(async (_target: unknown, _code: string, _opts?: unknown) => ({
    result: { type: 'string' as const, value: 'mocked' },
  })),
);

vi.mock('../../src/utils/cdp-pool', () => ({
  CdpConnectionPool: {
    getInstance: () => ({ evaluate: evaluateMock }),
  },
}));

import {
  executeInElectron,
  _evaluateQueueByTarget,
  type DevToolsTarget,
} from '../../src/utils/electron-connection';

const targetA: DevToolsTarget = {
  id: 'target-A',
  title: 'Window A',
  url: 'file:///a',
  type: 'page',
  webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/target-A',
};

const targetB: DevToolsTarget = {
  id: 'target-B',
  title: 'Window B',
  url: 'file:///b',
  type: 'page',
  webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/target-B',
};

/**
 * Build a controllable promise for use as the mock evaluate response.
 * Pair the returned `promise` with `resolve()`/`reject()` to drive timing
 * deterministically.
 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: Error) => void } {
  let resolve!: (value: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  evaluateMock.mockReset();
  _evaluateQueueByTarget.clear();
});

afterEach(() => {
  _evaluateQueueByTarget.clear();
});

describe('executeInElectron — Issue #10 per-target serialization', () => {
  it('serializes 3 parallel calls on the same targetId', async () => {
    // Arrange: each evaluate call returns a controllable deferred promise.
    // Track the order in which the mock was entered to prove no overlap.
    const callOrder: string[] = [];
    const completionOrder: string[] = [];
    const deferreds = [deferred<{ result: { type: 'string'; value: string } }>(),
                       deferred<{ result: { type: 'string'; value: string } }>(),
                       deferred<{ result: { type: 'string'; value: string } }>()];
    let callCount = 0;

    evaluateMock.mockImplementation(async (_t: unknown, code: string) => {
      const idx = callCount++;
      callOrder.push(code);
      const result = await deferreds[idx].promise;
      completionOrder.push(code);
      return result;
    });

    // Act: fire 3 calls on the same target without awaiting.
    const p1 = executeInElectron('code-1', targetA);
    const p2 = executeInElectron('code-2', targetA);
    const p3 = executeInElectron('code-3', targetA);

    // Yield so call #1 can enter the mock.
    await new Promise((r) => setTimeout(r, 0));
    expect(callOrder).toEqual(['code-1']);

    // Resolve #1 → #2 may now enter.
    deferreds[0].resolve({ result: { type: 'string', value: 'r1' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(callOrder).toEqual(['code-1', 'code-2']);

    // Resolve #2 → #3 may now enter.
    deferreds[1].resolve({ result: { type: 'string', value: 'r2' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(callOrder).toEqual(['code-1', 'code-2', 'code-3']);

    // Resolve #3.
    deferreds[2].resolve({ result: { type: 'string', value: 'r3' } });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe('✅ Command executed: r1');
    expect(r2).toBe('✅ Command executed: r2');
    expect(r3).toBe('✅ Command executed: r3');

    expect(completionOrder).toEqual(['code-1', 'code-2', 'code-3']);
  });

  it('runs calls on different targets fully in parallel', async () => {
    // Both calls enter the mock before either resolves — proves no
    // cross-target serialization.
    const dA = deferred<{ result: { type: 'string'; value: string } }>();
    const dB = deferred<{ result: { type: 'string'; value: string } }>();

    let active = 0;
    let maxConcurrent = 0;
    evaluateMock.mockImplementation(async (target: any) => {
      active++;
      maxConcurrent = Math.max(maxConcurrent, active);
      const d = target.id === 'target-A' ? dA : dB;
      const r = await d.promise;
      active--;
      return r;
    });

    const pA = executeInElectron('on-A', targetA);
    const pB = executeInElectron('on-B', targetB);

    await new Promise((r) => setTimeout(r, 0));
    expect(maxConcurrent).toBe(2);

    dA.resolve({ result: { type: 'string', value: 'a' } });
    dB.resolve({ result: { type: 'string', value: 'b' } });
    await Promise.all([pA, pB]);
  });

  it('does not propagate previous failure to next caller', async () => {
    let callIndex = 0;
    evaluateMock.mockImplementation(async () => {
      callIndex++;
      if (callIndex === 1) throw new Error('boom');
      return { result: { type: 'string' as const, value: 'ok' } };
    });

    const failing = executeInElectron('will-fail', targetA);
    const succeeding = executeInElectron('will-succeed', targetA);

    await expect(failing).rejects.toThrow(/DevTools Protocol error: boom/);
    await expect(succeeding).resolves.toBe('✅ Command executed: ok');
  });

  it('cleans up the queue map after the tail resolves', async () => {
    evaluateMock.mockResolvedValue({ result: { type: 'string', value: 'ok' } });

    await executeInElectron('one-call', targetA);
    // Allow the .then(cleanup, cleanup) microtask to run.
    await new Promise((r) => setTimeout(r, 0));

    expect(_evaluateQueueByTarget.has('target-A')).toBe(false);
    expect(_evaluateQueueByTarget.size).toBe(0);
  });

  it('cleans up after a rejected call too', async () => {
    evaluateMock.mockRejectedValue(new Error('boom'));

    await expect(executeInElectron('bad', targetA)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 0));

    expect(_evaluateQueueByTarget.has('target-A')).toBe(false);
  });

  /**
   * Regression test for the deadlock found in v2.0.1 adversarial review:
   * `Promise.all([wait_for_*, action])` is the canonical async-UI pattern,
   * and serializing the wait would queue the action behind it. The wait blocks
   * until its trigger fires, but the trigger is queued — deadlock until the
   * wait's user timeout. Internal wait/observer commands pass `awaitPromise: true`
   * to flag this; `executeInElectron` must bypass the queue for those.
   */
  it('bypasses the queue when awaitPromise: true', async () => {
    const callOrder: string[] = [];
    const waitDeferred = deferred<{ result: { type: 'string'; value: string } }>();
    let callCount = 0;

    evaluateMock.mockImplementation(async (_t: unknown, code: string) => {
      callOrder.push(`enter:${code}`);
      const idx = callCount++;
      // First call (the wait) holds open until we explicitly resolve it.
      // The action call must enter immediately even though the wait hasn't returned.
      if (idx === 0) {
        await waitDeferred.promise;
      }
      callOrder.push(`exit:${code}`);
      return { result: { type: 'string', value: code } };
    });

    // Fire wait (awaitPromise: true) and a synchronous action concurrently.
    const waitCall = executeInElectron('wait-for-something', targetA, { awaitPromise: true });
    const actionCall = executeInElectron('action-that-triggers-it', targetA);

    // Action must enter the mock BEFORE the wait resolves — proves it didn't queue.
    await Promise.resolve();
    await Promise.resolve();
    expect(callOrder).toContain('enter:action-that-triggers-it');
    expect(callOrder).toContain('exit:action-that-triggers-it');

    // Now resolve the wait; both calls finish.
    waitDeferred.resolve({ result: { type: 'string', value: 'wait-for-something' } });
    await Promise.all([waitCall, actionCall]);
  });

  /**
   * The bypass must only affect awaitPromise=true callers — synchronous evals
   * still need ordering (e.g., `window.x = 1` then `read window.x`).
   */
  it('still serializes synchronous evals when an awaitPromise call is in-flight', async () => {
    const callOrder: string[] = [];
    const syncDeferreds = [deferred<{ result: { type: 'string'; value: string } }>(),
                           deferred<{ result: { type: 'string'; value: string } }>()];
    let syncIdx = 0;

    evaluateMock.mockImplementation(async (_t: unknown, code: string) => {
      callOrder.push(`enter:${code}`);
      if (code === 'wait') {
        // Resolve immediately — we only care about ordering of the two sync calls.
        return { result: { type: 'string', value: 'wait-done' } };
      }
      const result = await syncDeferreds[syncIdx++].promise;
      callOrder.push(`exit:${code}`);
      return result;
    });

    const waitCall = executeInElectron('wait', targetA, { awaitPromise: true });
    const sync1 = executeInElectron('sync-1', targetA);
    const sync2 = executeInElectron('sync-2', targetA);

    await waitCall;
    // Resolve sync-1 first; sync-2 must not have entered yet.
    syncDeferreds[0].resolve({ result: { type: 'string', value: 'sync-1' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(callOrder).not.toContain('enter:sync-2');
    syncDeferreds[1].resolve({ result: { type: 'string', value: 'sync-2' } });
    await Promise.all([sync1, sync2]);
    expect(callOrder.indexOf('exit:sync-1')).toBeLessThan(callOrder.indexOf('enter:sync-2'));
  });
});
