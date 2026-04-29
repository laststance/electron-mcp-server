import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const DEFAULT_TIMEOUT_MS = 10000;
const HARD_TIMEOUT_BUFFER_MS = 2000;

const schema = z.object({
  ...windowTargetFields,
  expectedUrlSubstring: z
    .string()
    .optional()
    .describe(
      'If provided, wait until window.location.href contains this substring. Otherwise, wait for any URL change.',
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(120000)
    .default(DEFAULT_TIMEOUT_MS)
    .describe('Maximum wait in milliseconds (default 10000, capped at 120000).'),
});

/**
 * Wait for a navigation event.
 *
 * Two listening strategies in parallel:
 * 1. `popstate` + `hashchange` event listeners (covers SPA route changes)
 * 2. URL polling at 100ms intervals (covers `pushState` without dispatched
 *    `popstate`, which React Router and friends often do)
 *
 * Resolution strings:
 * - `Navigated to: <url> (waited <ms>ms)` — URL changed (or matched substring)
 * - `Timeout: URL did not change within <ms>ms (current: <url>)`
 *
 * If `expectedUrlSubstring` is supplied, match is "url contains substring".
 * Otherwise, match is "url differs from initial URL".
 */
export const waitForNavigation = defineCommand({
  name: 'electron_wait_for_navigation',
  description:
    'Wait for a URL change (or for the URL to contain expectedUrlSubstring). Default 10000ms, capped at 120000ms.',
  schema,
  operationType: 'query',
  async execute(args, target) {
    const expectedSubstring = args.expectedUrlSubstring ?? '';
    const escapedExpected = escapeJsString(expectedSubstring);
    const timeoutMs = args.timeoutMs;

    const javascriptCode = `
      (function() {
        return new Promise((resolve) => {
          const start = Date.now();
          const initialUrl = window.location.href;
          const expected = ${escapedExpected};
          const timeoutMs = ${timeoutMs};

          const matches = () => {
            const currentUrl = window.location.href;
            if (expected) return currentUrl.indexOf(expected) !== -1;
            return currentUrl !== initialUrl;
          };

          if (matches()) {
            resolve('Navigated to: ' + window.location.href + ' (waited 0ms)');
            return;
          }

          let resolved = false;
          const finish = (msg) => {
            if (resolved) return;
            resolved = true;
            window.removeEventListener('popstate', check);
            window.removeEventListener('hashchange', check);
            clearInterval(poller);
            clearTimeout(timer);
            resolve(msg);
          };

          const check = () => {
            if (matches()) {
              finish('Navigated to: ' + window.location.href + ' (waited ' + (Date.now() - start) + 'ms)');
            }
          };

          window.addEventListener('popstate', check);
          window.addEventListener('hashchange', check);
          const poller = setInterval(check, 100);

          const timer = setTimeout(() => {
            finish('Timeout: URL did not change within ' + timeoutMs + 'ms (current: ' + window.location.href + ')');
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
