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
 * Navigate to a hash route via `history.pushState` + manual `hashchange`
 * dispatch (so React Router and similar listeners pick up the change).
 *
 * Sanitization rejects `javascript:`, `<script`, and full URLs (`://`) to
 * keep this strictly an in-app navigation.
 */
export const navigateToHash = defineCommand({
  name: 'electron_navigate_to_hash',
  description:
    'Navigate to a hash route (e.g., "#create"). Uses pushState + manual hashchange so React Router picks it up.',
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
            const newUrl = window.location.pathname + window.location.search + ${hashLiteral};
            window.history.pushState({}, '', newUrl);

            window.dispatchEvent(new HashChangeEvent('hashchange', {
              newURL: window.location.href,
              oldURL: window.location.href.replace(${hashLiteral}, '')
            }));

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
