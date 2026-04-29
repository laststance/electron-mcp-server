import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const DEFAULT_TIMEOUT_MS = 5000;
const HARD_TIMEOUT_BUFFER_MS = 2000;

const schema = z.object({
  ...windowTargetFields,
  text: z.string().min(1).describe('Substring to wait for in document.body.textContent.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(60000)
    .default(DEFAULT_TIMEOUT_MS)
    .describe('Maximum wait in milliseconds (default 5000, capped at 60000).'),
});

/**
 * Wait until `document.body.textContent` contains the requested substring.
 * Uses `MutationObserver` with `characterData: true` so we react to text node
 * mutations as well as new nodes being inserted.
 *
 * Resolution strings:
 * - `Found: text appeared (waited <ms>ms)`
 * - `Timeout: text not found within <ms>ms: <text>`
 *
 * Note: this is a substring match against the *entire* body, so callers
 * looking for tighter scoping should pair it with `wait_for_selector`.
 */
export const waitForText = defineCommand({
  name: 'electron_wait_for_text',
  description:
    'Wait until a substring appears in document.body. MutationObserver-based; returns "Found" or "Timeout" within timeoutMs (default 5000ms).',
  schema,
  operationType: 'query',
  async execute(args, target) {
    const escapedText = escapeJsString(args.text);
    const timeoutMs = args.timeoutMs;

    const javascriptCode = `
      (function() {
        return new Promise((resolve) => {
          const start = Date.now();
          const needle = ${escapedText};
          const timeoutMs = ${timeoutMs};

          const matches = () =>
            (document.body && document.body.textContent && document.body.textContent.indexOf(needle) !== -1);

          if (matches()) {
            resolve('Found: text appeared (waited 0ms)');
            return;
          }

          let resolved = false;
          const finish = (msg) => {
            if (resolved) return;
            resolved = true;
            try { observer.disconnect(); } catch (e) {}
            clearTimeout(timer);
            resolve(msg);
          };

          const observer = new MutationObserver(() => {
            if (matches()) finish('Found: text appeared (waited ' + (Date.now() - start) + 'ms)');
          });
          observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            characterData: true,
          });

          const timer = setTimeout(() => {
            finish('Timeout: text not found within ' + timeoutMs + 'ms: ' + needle);
          }, timeoutMs);
        });
      })()
    `;

    return executeInElectron(javascriptCode, target, {
      awaitPromise: true,
      timeoutMs: timeoutMs + HARD_TIMEOUT_BUFFER_MS,
    });
  },
});
