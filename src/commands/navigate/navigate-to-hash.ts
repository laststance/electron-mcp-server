import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  hash: z
    .string()
    .min(1)
    .describe('Hash route to navigate to (e.g., "#create" or "create"). Leading "#" is optional.'),
});

/**
 * Navigate to a hash route via `history.pushState` followed by both `hashchange`
 * and `popstate` dispatch.
 *
 * Why two events: legacy listeners (and code that wraps `window.location.hash`)
 * watch `hashchange`, but react-router-dom v7's `HashRouter` (and other
 * `createHashHistory` consumers) primarily subscribe to `popstate`. Issue #17
 * showed the URL bar updating while `useLocation()` stayed on the old route
 * because `pushState` does not fire `popstate` natively.
 *
 * Sanitization rejects `javascript:`, `<script`, and full URLs (`://`) to
 * keep this strictly an in-app navigation.
 */
export const navigateToHash = defineCommand({
  name: 'electron_navigate_to_hash',
  description:
    'Navigate to a hash route (e.g., "#create"). Uses pushState + manual hashchange + popstate dispatch so both legacy listeners and react-router-dom v7 HashRouter pick it up.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    if (
      args.hash.includes('javascript:') ||
      args.hash.includes('<script') ||
      args.hash.includes('://')
    ) {
      return 'Invalid hash: contains dangerous content';
    }
    const cleanHash = args.hash.startsWith('#') ? args.hash : '#' + args.hash;
    // Always serialize the user-supplied hash through escapeJsString before
    // interpolation so attacker-controlled input cannot break out of the
    // string literal and execute arbitrary JS in the renderer.
    const hashLiteral = escapeJsString(cleanHash);

    const javascriptCode = `
      (function() {
        try {
          if (window.history && window.history.pushState) {
            const oldHref = window.location.href;
            const newUrl = window.location.pathname + window.location.search + ${hashLiteral};
            window.history.pushState({}, '', newUrl);

            window.dispatchEvent(new HashChangeEvent('hashchange', {
              newURL: window.location.href,
              oldURL: oldHref
            }));

            // react-router-dom v7 HashRouter (createHashHistory) listens on popstate.
            // pushState does not fire popstate natively, so dispatch it manually.
            window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

            return 'Navigated to hash: ' + ${hashLiteral};
          } else {
            window.location.hash = ${hashLiteral};
            return 'Navigated to hash (fallback): ' + ${hashLiteral};
          }
        } catch (e) {
          return 'Error navigating: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
