import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

/**
 * Some MCP clients serialize array fields as a JSON-encoded string when the
 * underlying transport flattens arguments (observed in #15 — `Expected array,
 * received string at scopes`). Accept both shapes via `z.preprocess`: parse a
 * string that looks like a JSON array, otherwise pass the value through
 * untouched and let the inner schema flag genuine type errors.
 *
 * @example
 *   coerceScopes('["local","session"]') // => ['local', 'session']
 *   coerceScopes(['local', 'cookies'])  // => ['local', 'cookies'] (untouched)
 *   coerceScopes('local')               // => 'local' (will fail z.array check)
 */
function coerceScopes(rawScopes: unknown): unknown {
  if (typeof rawScopes !== 'string') return rawScopes;
  const trimmed = rawScopes.trim();
  if (!trimmed.startsWith('[')) return rawScopes;
  try {
    return JSON.parse(trimmed);
  } catch {
    return rawScopes;
  }
}

const schema = z.object({
  ...windowTargetFields,
  scopes: z
    .preprocess(coerceScopes, z.array(z.enum(['local', 'session', 'cookies'])).min(1))
    .describe(
      'Storage scopes to clear. Cookies are cleared for the current document.cookie origin only. Accepts a JSON-encoded array string for clients that serialize arrays as strings.',
    ),
});

/**
 * Clear one or more storage scopes for the current renderer.
 *
 * Cookie handling: iterates `document.cookie`, sets each cookie to expire
 * in the past. Only same-site, non-`HttpOnly` cookies are visible — anything
 * `HttpOnly` survives. For full cookie wipes, prefer `session.clearStorageData`
 * from the Electron main process (out of scope for this MCP server).
 *
 * Returns: `Cleared: <comma-separated scopes>` on success.
 */
export const clearStorage = defineCommand({
  name: 'electron_clear_storage',
  description:
    'Clear local/session/cookie storage scopes. Cookies are best-effort (HttpOnly survives) — for full wipe use session.clearStorageData in main process.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    const scopesLiteral = JSON.stringify(args.scopes);

    const javascriptCode = `
      (function() {
        try {
          const scopes = ${scopesLiteral};
          const cleared = [];

          if (scopes.indexOf('local') !== -1 && window.localStorage) {
            window.localStorage.clear();
            cleared.push('local');
          }
          if (scopes.indexOf('session') !== -1 && window.sessionStorage) {
            window.sessionStorage.clear();
            cleared.push('session');
          }
          if (scopes.indexOf('cookies') !== -1) {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
              const eqIndex = cookies[i].indexOf('=');
              const cookieName = (eqIndex > -1 ? cookies[i].substring(0, eqIndex) : cookies[i]).trim();
              if (cookieName) {
                document.cookie = cookieName + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
              }
            }
            cleared.push('cookies');
          }

          return 'Cleared: ' + cleared.join(', ');
        } catch (e) {
          return 'Storage error: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
