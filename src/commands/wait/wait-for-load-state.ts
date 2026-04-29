import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const DEFAULT_TIMEOUT_MS = 30000;
const HARD_TIMEOUT_BUFFER_MS = 2000;
const NETWORK_IDLE_QUIET_MS = 500;

const schema = z.object({
  ...windowTargetFields,
  state: z
    .enum(['load', 'domcontentloaded', 'networkidle'])
    .default('load')
    .describe(
      'Page lifecycle state to wait for. "load" = window.load fired, "domcontentloaded" = DOMContentLoaded fired, "networkidle" = no fetch/XHR for 500ms.',
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(120000)
    .default(DEFAULT_TIMEOUT_MS)
    .describe('Maximum wait in milliseconds (default 30000, capped at 120000).'),
});

/**
 * Wait for a page lifecycle state.
 *
 * State semantics (Playwright-aligned):
 * - `load` — `document.readyState === 'complete'` (the `load` event fired)
 * - `domcontentloaded` — `document.readyState` is `'interactive'` or
 *   `'complete'` (DOMContentLoaded fired)
 * - `networkidle` — best effort: monkey-patches `fetch` and `XMLHttpRequest`
 *   to count active requests, then waits for the count to stay at 0 for
 *   500ms. Patching is reverted before resolving. CDP's Network domain
 *   would be cleaner, but this avoids requiring a domain-enable
 *   round-trip and stays scoped to the wait.
 *
 * Resolution strings:
 * - `Load state reached: <state> (waited <ms>ms)`
 * - `Timeout: load state <state> not reached within <ms>ms`
 */
export const waitForLoadState = defineCommand({
  name: 'electron_wait_for_load_state',
  description:
    'Wait for page lifecycle: load | domcontentloaded | networkidle. Default 30000ms, networkidle = 500ms quiet window.',
  schema,
  operationType: 'query',
  async execute(args, target) {
    const state = args.state;
    const stateLiteral = JSON.stringify(state);
    const timeoutMs = args.timeoutMs;

    const javascriptCode = `
      (function() {
        return new Promise((resolve) => {
          const start = Date.now();
          const state = ${stateLiteral};
          const timeoutMs = ${timeoutMs};
          const NETWORK_IDLE_QUIET_MS = ${NETWORK_IDLE_QUIET_MS};

          let resolved = false;
          // \`let\` so the networkidle branch can swap the timeout for one
          // that also restores its monkey patches before resolving.
          let timer;
          const finish = (msg) => {
            if (resolved) return;
            resolved = true;
            if (timer) clearTimeout(timer);
            resolve(msg);
          };

          timer = setTimeout(() => {
            finish('Timeout: load state ' + state + ' not reached within ' + timeoutMs + 'ms');
          }, timeoutMs);

          if (state === 'domcontentloaded') {
            if (document.readyState === 'interactive' || document.readyState === 'complete') {
              finish('Load state reached: domcontentloaded (waited 0ms)');
              return;
            }
            document.addEventListener('DOMContentLoaded', () => {
              finish('Load state reached: domcontentloaded (waited ' + (Date.now() - start) + 'ms)');
            }, { once: true });
            return;
          }

          if (state === 'load') {
            if (document.readyState === 'complete') {
              finish('Load state reached: load (waited 0ms)');
              return;
            }
            window.addEventListener('load', () => {
              finish('Load state reached: load (waited ' + (Date.now() - start) + 'ms)');
            }, { once: true });
            return;
          }

          // state === 'networkidle': monkey-patch fetch/XHR to count active requests.
          let activeCount = 0;
          let quietTimer = null;

          // Capture the raw function reference rather than a bound copy so
          // restorePatches puts back the *exact* original (function identity
          // matters — some libraries cache window.fetch by reference).
          const originalFetch = window.fetch || null;
          const originalXhrOpen = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
          const originalXhrSend = window.XMLHttpRequest && window.XMLHttpRequest.prototype.send;

          const inc = () => {
            activeCount++;
            if (quietTimer) {
              clearTimeout(quietTimer);
              quietTimer = null;
            }
          };
          const dec = () => {
            activeCount = Math.max(0, activeCount - 1);
            if (activeCount === 0) scheduleQuietCheck();
          };

          const scheduleQuietCheck = () => {
            if (quietTimer) clearTimeout(quietTimer);
            quietTimer = setTimeout(() => {
              if (activeCount === 0 && !resolved) {
                restorePatches();
                finish('Load state reached: networkidle (waited ' + (Date.now() - start) + 'ms)');
              }
            }, NETWORK_IDLE_QUIET_MS);
          };

          const restorePatches = () => {
            if (originalFetch) window.fetch = originalFetch;
            if (originalXhrOpen) window.XMLHttpRequest.prototype.open = originalXhrOpen;
            if (originalXhrSend) window.XMLHttpRequest.prototype.send = originalXhrSend;
          };

          if (originalFetch) {
            window.fetch = function() {
              inc();
              // Sync throws (e.g. invalid input) bypass the .then chain — guard
              // them so dec() still runs and activeCount can return to zero.
              // apply(window, ...) because some fetch impls require a window
              // \`this\`; calling with the wrapper's \`this\` raises "Illegal invocation".
              try {
                const promise = originalFetch.apply(window, arguments);
                return Promise.resolve(promise).finally(dec);
              } catch (error) {
                dec();
                throw error;
              }
            };
          }
          if (originalXhrOpen && originalXhrSend) {
            window.XMLHttpRequest.prototype.send = function() {
              inc();
              this.addEventListener('loadend', dec, { once: true });
              // Symmetric guard: send() can throw synchronously (e.g. on
              // unopened XHR). Without this catch, inc() runs but dec() never
              // does, and networkidle waits forever.
              try {
                return originalXhrSend.apply(this, arguments);
              } catch (error) {
                dec();
                throw error;
              }
            };
          }

          // Wrap the original timeout so we restore patches even on timeout.
          // Reassign \`timer\` so a successful networkidle finish (via
          // scheduleQuietCheck) clears THIS timeout, not the stale one.
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (resolved) return;
            restorePatches();
            finish('Timeout: load state networkidle not reached within ' + timeoutMs + 'ms');
          }, timeoutMs);

          // If page is already idle, schedule the initial quiet check.
          if (activeCount === 0) scheduleQuietCheck();
        });
      })()
    `;

    return executeInElectron(javascriptCode, target, {
      awaitPromise: true,
      timeoutMs: timeoutMs + HARD_TIMEOUT_BUFFER_MS,
    });
  },
});
