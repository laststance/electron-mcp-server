import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const DEFAULT_TIMEOUT_MS = 5000;
const HARD_TIMEOUT_BUFFER_MS = 2000;

const schema = z.object({
  ...windowTargetFields,
  selector: z.string().min(1).describe('CSS selector to wait for.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(60000)
    .default(DEFAULT_TIMEOUT_MS)
    .describe('Maximum wait in milliseconds (default 5000, capped at 60000).'),
});

/**
 * Wait until at least one element matches the selector, using a
 * `MutationObserver` to react to DOM changes synchronously.
 *
 * Resolution strings (returned as plain text by the IIFE):
 * - `Found: <selector> (waited <ms>ms)` — match observed
 * - `Timeout: selector not found within <ms>ms: <selector>` — gave up
 *
 * The IIFE returns a Promise; CDP's `awaitPromise: true` makes the call block
 * until the Promise resolves. We also enforce a hard CDP-level timeout slightly
 * larger than the user-requested timeout, so a stuck observer can't hang the
 * connection.
 */
export const waitForSelector = defineCommand({
  name: 'electron_wait_for_selector',
  description:
    'Wait for a CSS selector to match. MutationObserver-based; returns "Found" or "Timeout" within timeoutMs (default 5000ms).',
  schema,
  operationType: 'query',
  async execute(args, target) {
    if (containsDangerousContent(args.selector)) {
      return 'Invalid selector: contains dangerous content';
    }
    const escapedSelector = escapeJsString(args.selector);
    const timeoutMs = args.timeoutMs;

    const javascriptCode = `
      (function() {
        return new Promise((resolve) => {
          const start = Date.now();
          const selector = ${escapedSelector};
          const timeoutMs = ${timeoutMs};

          const initial = document.querySelector(selector);
          if (initial) {
            resolve('Found: ' + selector + ' (waited 0ms)');
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
            const el = document.querySelector(selector);
            if (el) finish('Found: ' + selector + ' (waited ' + (Date.now() - start) + 'ms)');
          });
          observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true,
            attributes: true,
          });

          const timer = setTimeout(() => {
            finish('Timeout: selector not found within ' + timeoutMs + 'ms: ' + selector);
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
